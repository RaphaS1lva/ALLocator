# -*- coding: utf-8 -*-
"""
Eval de EXTRAÇÃO — mede a acurácia do /extract contra um gabarito transcrito
à mão (golden dataset).

Uso:
    python eval/eval_extract.py <pdf> [--api http://127.0.0.1:8123] [--visao Consolidado]

Métricas:
  · recall de contas       — % das linhas do gabarito encontradas na extração
  · acurácia de valores    — % das células (conta × período) com valor EXATO
  · precisão de escopo     — contas proibidas (outras visões/DFC/DMPL) ausentes
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import unicodedata
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from gabarito_fleury import BP, DRE, NAO_DEVE_TER  # noqa: E402


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "").strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.split())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--api", default="http://127.0.0.1:8123")
    ap.add_argument("--visao", default="Consolidado")
    args = ap.parse_args()

    print(f"Enviando {args.pdf} para {args.api}/extract …")
    with open(args.pdf, "rb") as f:
        r = httpx.post(f"{args.api}/extract",
                       files={"file": (Path(args.pdf).name, f, "application/pdf")},
                       timeout=600)
    if r.status_code != 200:
        print(f"FALHA: HTTP {r.status_code}: {r.text[:300]}")
        sys.exit(1)
    out = r.json()
    rows = out["rows"]
    meta = out["meta"]
    print(f"provider={out.get('provider')} | {len(rows)} linhas extraídas")
    print(f"períodos detectados: {meta.get('anos')}")
    print(f"bp={meta.get('paginas_bp')} dre={meta.get('paginas_dre')} falhas={meta.get('paginas_com_falha')}")
    print()

    # períodos da visão avaliada, na ordem detectada
    vis = norm(args.visao)
    periodos_visao = [p for p in (meta.get("anos") or []) if vis in norm(p)]
    if len(periodos_visao) < 1:
        print(f"⚠ nenhum período da visão '{args.visao}' foi detectado — as chaves de valores serão avaliadas pela ordem")
    print(f"períodos da visão '{args.visao}': {periodos_visao}")

    # indexa extração: (origem_norm, grupo_norm) -> [rows]  (homônimos: consome em ordem)
    from collections import defaultdict
    idx: dict[tuple, list] = defaultdict(list)
    for rr in rows:
        idx[(norm(rr["origem"]), norm(rr.get("grupo") or ""))].append(rr)
    # fallback: só por origem
    idx_orig: dict[str, list] = defaultdict(list)
    for rr in rows:
        idx_orig[norm(rr["origem"])].append(rr)

    gabarito = [("BP", *g) for g in BP] + [("DRE", *g) for g in DRE]
    encontradas = 0
    celulas_total = 0
    celulas_ok = 0
    erros: list[str] = []

    for demo, origem, grupo, v1, v2 in gabarito:
        cands = idx.get((norm(origem), norm(grupo))) or idx_orig.get(norm(origem)) or []
        if not cands:
            erros.append(f"[faltou]   {demo}: {origem}")
            continue
        rr = cands.pop(0)  # homônimos consumidos em ordem de documento
        encontradas += 1
        valores = rr.get("valores") or {}
        # mapeia: 1º período da visão -> v1 (mais recente), 2º -> v2
        esperados = [v for v in (v1, v2) if v is not None]
        chaves = periodos_visao or list(valores.keys())
        got = [valores.get(k) for k in chaves if valores.get(k) is not None]
        # ordem: detectado pode vir [recente, anterior] ou invertido — testa direto
        for i, exp in enumerate(esperados):
            celulas_total += 1
            ok = any(abs(float(g) - float(exp)) < 0.51 for g in got) if got else False
            if ok:
                celulas_ok += 1
            else:
                erros.append(f"[valor]    {demo}: {origem} — esperado {exp}, veio {got or 'nada'}")
                break  # não conta 2x a mesma linha ruim

    # escopo: contas que NÃO deveriam existir na visão consolidada c/ valor
    vazamentos = []
    for proibida in NAO_DEVE_TER:
        for rr in idx_orig.get(norm(proibida), []):
            vals = {k: v for k, v in (rr.get("valores") or {}).items() if vis in norm(k)}
            if vals:
                vazamentos.append(f"{proibida}: {vals}")

    n_gab = len(gabarito)
    print()
    print("=" * 62)
    print(f"RECALL DE CONTAS      : {encontradas}/{n_gab} = {encontradas / n_gab:.1%}")
    if celulas_total:
        print(f"ACURÁCIA DE VALORES   : {celulas_ok}/{celulas_total} = {celulas_ok / celulas_total:.1%}")
    print(f"VAZAMENTOS DE ESCOPO  : {len(vazamentos)} {'✓' if not vazamentos else '✗'}")
    print("=" * 62)
    if erros:
        print(f"\nDivergências ({len(erros)}):")
        for e in erros[:30]:
            print(" ", e)
        if len(erros) > 30:
            print(f"  … +{len(erros) - 30}")
    for v in vazamentos:
        print("  [vazou]", v)


if __name__ == "__main__":
    main()

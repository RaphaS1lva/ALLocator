# -*- coding: utf-8 -*-
"""Gera os seeds do app a partir dos JSONs extraidos:
- src/data/planoContas.seed.js  (contas do template: Ativo/Passivo/PL/DRE)
- src/data/dicionario.seed.js    (1285 regras Origem->Destino)
Emite modulos ES (export const ...), portaveis p/ browser e node.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
DATA = os.path.join(APP, "src", "data")
os.makedirs(DATA, exist_ok=True)

tpl = json.load(open(os.path.join(HERE, "template.json"), encoding="utf-8"))
dic = json.load(open(os.path.join(HERE, "dicionario.json"), encoding="utf-8"))


def shadow_cells():
    for k, sh in tpl["sheets"].items():
        if k.strip().lower().startswith("shadow"):
            return sh["full"]["cells"]
    raise RuntimeError("shadow not found")


def cval(cells, addr):
    c = cells.get(addr)
    if c is None:
        return None
    return c.get("v")


def sign_prefix(name):
    n = str(name).strip()
    if n.startswith("+/-") or n.startswith("+ /-") or n.startswith("+/ -"):
        return "pm"      # preserva sinal do OCR
    if n.startswith("-"):
        return "neg"     # |OCR| (positivo) - o template subtrai
    if n.startswith("+"):
        return "pos"     # |OCR| (positivo) - o template soma
    return "none"        # preserva (na pratica positivo)


def is_sumifs(formula):
    return isinstance(formula, str) and "SUMIFS" in formula.upper()


def build_plano():
    cells = shadow_cells()
    rows = []
    # ---- Lado Ativo/Passivo/PL: coluna A, formula em B ----
    for r in range(5, 81):
        name = cval(cells, f"A{r}")
        if name is None or str(name).strip() == "":
            continue
        b = cval(cells, f"B{r}")
        tipo = "conta" if is_sumifs(b) else "subtotal"
        # grupo
        if r <= 41:
            grupo = "Ativo"
            sub = "Circulante" if r <= 22 else "Não Circulante"
        elif 44 <= r <= 72:
            grupo = "Passivo"
            sub = "Circulante" if r <= 61 else "Não Circulante"
        else:  # 75-80
            grupo = "Passivo"
            sub = "PL"
        rows.append({
            "ordem": r,
            "row": r,
            "side": "AP",
            "destino": str(name),
            "grupo": grupo,
            "subCategoria": sub,
            "tipo": tipo,
            "sign": sign_prefix(name),
        })
    # ---- Lado DRE: coluna S, formula em T ----
    for r in range(5, 41):
        name = cval(cells, f"S{r}")
        if name is None or str(name).strip() == "":
            continue
        t = cval(cells, f"T{r}")
        tipo = "conta" if is_sumifs(t) else "subtotal"
        rows.append({
            "ordem": 100 + r,
            "row": r,
            "side": "DRE",
            "destino": str(name),
            "grupo": "DRE",
            "subCategoria": "DRE",
            "tipo": tipo,
            "sign": sign_prefix(name),
        })
    return rows


def build_dic():
    recs = dic["sheets"]["Sheet1"]["records"]
    out = []
    for rec in recs:
        origem = rec.get("ORIGEM") or rec.get("Origem") or ""
        destino = rec.get("Destino no Template") or ""
        grupo = rec.get("Grupo") or ""
        sub = rec.get("Sub Categoria") or ""
        if str(origem).strip() == "":
            continue
        out.append({
            "origem": str(origem).strip(),
            "destino": str(destino).strip(),
            "grupo": str(grupo).strip(),
            "subCategoria": str(sub).strip(),
        })
    return out


def js_module(varname, data, header):
    body = json.dumps(data, ensure_ascii=False, indent=0)
    return f"// {header}\n// AUTO-GERADO - nao editar a mao.\nexport const {varname} = {body};\n"


def parse_calc_terms(formula):
    """Parseia uma formula aritmetica simples (=+B6+B5, =SUM(B23:B29),
    =SUM(B7,B11,B15,B16:B21), =T9-T10-T11, =-T21+T22) em termos
    {sign, rows:[...]}. Refs a linhas < 5 (cabecalhos/ano) sao ignoradas."""
    f = formula.lstrip("=").replace(" ", "")
    terms = []
    sign = 1
    tok_re = re.compile(r"(SUM\(([^)]*)\))|([+\-])|(\$?[A-Z]{1,3}\$?\d+)")
    for m in tok_re.finditer(f):
        if m.group(1):  # SUM(...) — extrai todas as refs/ranges internas (aditivas)
            rows = []
            content = m.group(2)
            ref_re = re.compile(r"\$?[A-Z]{1,3}\$?(\d+):\$?[A-Z]{1,3}\$?(\d+)|\$?[A-Z]{1,3}\$?(\d+)")
            for part in ref_re.finditer(content):
                if part.group(1) is not None:  # range
                    r1 = int(part.group(1)); r2 = int(part.group(2))
                    rows += list(range(min(r1, r2), max(r1, r2) + 1))
                else:
                    rows.append(int(part.group(3)))
            rows = [r for r in rows if r >= 5]
            terms.append({"sign": sign, "rows": rows})
            sign = 1
        elif m.group(3):
            sign = 1 if m.group(3) == "+" else -1
        elif m.group(4):
            ref = m.group(4).replace("$", "")
            r = int(re.sub(r"[A-Z]+", "", ref))
            if r >= 5:
                terms.append({"sign": sign, "rows": [r]})
            sign = 1
    return terms


def build_shadow_compute():
    cells = shadow_cells()
    # mapa row->conta (AP e DRE) a partir do plano ja construido
    ap_by_row = {p["row"]: p for p in plano if p["side"] == "AP"}
    dre_by_row = {p["row"]: p for p in plano if p["side"] == "DRE"}

    def entry(r, name, formula, by_row):
        item = {"row": r, "destino": str(name)}
        if is_sumifs(formula):
            p = by_row.get(r)
            item["kind"] = "agg"
            item["grupo"] = p["grupo"] if p else ""
            item["subCategoria"] = p["subCategoria"] if p else ""
            item["sign"] = p["sign"] if p else "none"
        else:
            item["kind"] = "calc"
            item["terms"] = parse_calc_terms(str(formula)) if isinstance(formula, str) else []
        return item

    ap = []
    for r in range(5, 81):
        name = cval(cells, f"A{r}")
        if name is None or str(name).strip() == "":
            continue
        ap.append(entry(r, name, cval(cells, f"B{r}"), ap_by_row))
    dre = []
    for r in range(5, 41):
        name = cval(cells, f"S{r}")
        if name is None or str(name).strip() == "":
            continue
        dre.append(entry(r, name, cval(cells, f"T{r}"), dre_by_row))
    return {"AP": ap, "DRE": dre}


plano = build_plano()
dicionario = build_dic()
shadow_compute = build_shadow_compute()

with open(os.path.join(DATA, "planoContas.seed.js"), "w", encoding="utf-8") as f:
    f.write(js_module("PLANO_CONTAS", plano,
                      "Plano de Contas do template_plano_de_contas.xlsx (Shadow)"))

with open(os.path.join(DATA, "dicionario.seed.js"), "w", encoding="utf-8") as f:
    f.write(js_module("DICIONARIO_SEED", dicionario,
                      "Dicionario de Contas (Origem->Destino) - seed inicial"))

with open(os.path.join(DATA, "shadowCompute.seed.js"), "w", encoding="utf-8") as f:
    f.write(js_module("SHADOW_COMPUTE", shadow_compute,
                      "Estrutura de calculo da Shadow (agg SUMIFS / aritmetica de subtotal)"))

# Resumo
n_conta = sum(1 for p in plano if p["tipo"] == "conta")
print("plano:", len(plano), "linhas |", n_conta, "contas alocaveis |",
      len(plano) - n_conta, "subtotais")
print("dicionario:", len(dicionario), "regras")
grupos = {}
for p in plano:
    if p["tipo"] == "conta":
        grupos.setdefault((p["grupo"], p["subCategoria"]), 0)
        grupos[(p["grupo"], p["subCategoria"])] += 1
for k, v in grupos.items():
    print("   ", k, v)

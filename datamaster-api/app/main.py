"""
DataMaster · Allocator — API de IA (FastAPI)

Responsabilidades (e SOMENTE elas — o pipeline contábil determinístico roda
no frontend):
  POST /extract     -> extração estruturada de PDF escaneado/imagem (LLM visão)
  POST /julgamental -> sugestões de destino p/ contas não mapeadas (LLM texto)
  POST /parecer     -> parecer executivo em linguagem natural
  GET  /health      -> status + provedores ativos

As chaves de LLM vivem AQUI (variáveis de ambiente do host — HF Spaces /
Render), nunca no frontend do GitHub Pages.
"""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import asyncio

from .providers import (
    ProviderError,
    available_providers,
    complete_text,
    complete_vision,
    get_usage,
    parse_json_loose,
    pdf_page_images,
    pdf_page_texts,
    text_quality_ok,
)
from .prompts import (
    EXTRACT, EXTRACT_PAGE, EXTRACT_PAGE_TEXT, IDENTIFY, IDENTIFY_TEXT,
    JULGAMENTAL, PARECER, PROMPT_VERSION,
)

app = FastAPI(
    title="DataMaster Allocator API",
    version=PROMPT_VERSION,
    description="Camada de IA do portal — extração por visão, mapeamento julgamental e parecer.",
)

# CORS: em produção restrinja ao domínio do seu GitHub Pages
# (ex.: https://seuusuario.github.io) via env ALLOWED_ORIGINS.
_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "60"))
# limite prático do inline multimodal (Gemini): acima disso, só texto/imagens
VISION_INLINE_LIMIT_MB = 18

MIME_BY_EXT = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "").strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    # colapsa espacos: o template tem destinos com espaco duplo
    # ("-  Despesas Financeiras") que o LLM devolve com espaco simples
    return " ".join(s.split())


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "prompt_version": PROMPT_VERSION,
        "providers": available_providers(),
    }


# Limites APROXIMADOS dos free tiers (mudam com o tempo — sobrescreva via env
# USAGE_LIMITS_JSON). Servem de régua no painel de consumo do portal.
_DEFAULT_LIMITS = {
    "gemini": {"rpd": 250, "nota": "req/dia · gemini-2.5-flash free"},
    "groq": {"rpd": 1000, "tokens_dia": 100000, "nota": "llama-3.3-70b free"},
    "openrouter": {"rpd": 50, "nota": "modelos :free sem créditos"},
    "hf-router": {"nota": "créditos mensais grátis do Hugging Face"},
    "hf": {"nota": "Inference API (Tucano) — cold start"},
}
try:
    USAGE_LIMITS = {**_DEFAULT_LIMITS, **json.loads(os.getenv("USAGE_LIMITS_JSON", "{}"))}
except json.JSONDecodeError:
    USAGE_LIMITS = _DEFAULT_LIMITS


@app.get("/usage")
async def usage():
    """Consumo de tokens/requisições por provedor desde o boot do processo."""
    u = get_usage()
    return {**u, "limits": USAGE_LIMITS}


# ----------------------------------------------------------------------
# /extract — visão em DUAS PASSADAS
#   1. IDENTIFY: localiza páginas financeiras + rótulos de período + meta
#   2. EXTRACT_PAGE: extrai cada página como IMAGEM, individualmente —
#      chamadas menores são mais confiáveis (menos truncamento/503) e
#      garantem a CAPTURA COMPLETA em documentos longos.
# Fallback: se a identificação falhar, usa a extração single-shot antiga.
# ----------------------------------------------------------------------
MAX_FIN_PAGES = int(os.getenv("MAX_FIN_PAGES", "12"))
PAGE_CONCURRENCY = int(os.getenv("PAGE_CONCURRENCY", "2"))


def _noop(_msg: str) -> None:
    return None


async def _extract_two_pass(data: bytes, mime: str, progress=_noop):
    is_pdf = mime == "application/pdf"
    progress("lendo a camada de texto do documento…")
    page_texts: list[str] = pdf_page_texts(data) if is_pdf else []
    n_text_ok = sum(1 for t in page_texts if text_quality_ok(t))
    text_first = is_pdf and page_texts and (n_text_ok / len(page_texts)) >= 0.4
    progress("identificando páginas, visões e períodos…")

    # ---------- Passada 1: IDENTIFY ----------
    # PDF com camada de texto boa -> identificação por TEXTO (barata, estável,
    # funciona em arquivo de qualquer tamanho). Senão, visão sobre o binário
    # (limitada pelo tamanho do inline multimodal).
    if text_first:
        # digest curto: precisa caber no TPM dos provedores free (Groq ~6k)
        digest = "\n".join(
            f"--- página {i + 1} ---\n{t[:450]}" for i, t in enumerate(page_texts)
        )[:9000]
        ident_res = await complete_text(IDENTIFY_TEXT.format(digest=digest), json_mode=True)
    else:
        if len(data) > VISION_INLINE_LIMIT_MB * 1024 * 1024:
            raise HTTPException(
                413,
                f"PDF escaneado com mais de {VISION_INLINE_LIMIT_MB} MB: os provedores "
                "gratuitos de visão não aceitam arquivos tão grandes. Divida o PDF "
                "(só as páginas do BP/DRE) e envie novamente.",
            )
        ident_res = await complete_vision(IDENTIFY, data, mime, json_mode=True)
    ident = parse_json_loose(ident_res.text)

    paginas = []
    for p in ident.get("paginas_financeiras") or []:
        try:
            paginas.append(int(p))
        except (TypeError, ValueError):
            continue
    paginas = sorted(set(paginas))[:MAX_FIN_PAGES]
    if not is_pdf or not paginas:
        return None  # sem páginas identificáveis -> single-shot

    # dedupe preservando ordem (modelos fracos às vezes repetem rótulos)
    periodos = list(dict.fromkeys(str(x) for x in (ident.get("periodos") or [])))
    periodos_json = json.dumps(periodos, ensure_ascii=False) or '["valor"]'

    # ---------- Passada 2: extração POR PÁGINA ----------
    # Texto embutido quando existe (números exatos, ~90% menos tokens e a
    # cascata COMPLETA de provedores de texto); imagem só p/ página escaneada.
    paginas_img = [p for p in paginas
                   if not (1 <= p <= len(page_texts) and text_quality_ok(page_texts[p - 1]))]
    images = pdf_page_images(data, paginas_img) if paginas_img else {}

    sem = asyncio.Semaphore(PAGE_CONCURRENCY)

    async def one(pagina: int):
        texto = page_texts[pagina - 1] if 1 <= pagina <= len(page_texts) else ""
        progress(f"extraindo página {pagina} ({len(paginas)} no total)…")
        async with sem:
            if text_quality_ok(texto):
                prompt = EXTRACT_PAGE_TEXT.format(
                    pagina=pagina, periodos=periodos_json, texto=texto[:16000],
                )
                res = await complete_text(prompt, json_mode=True)
            else:
                png = images.get(pagina)
                if not png:
                    return []
                prompt = EXTRACT_PAGE.format(pagina=pagina, periodos=periodos_json)
                res = await complete_vision(prompt, png, "image/png", json_mode=True)
        parsed = parse_json_loose(res.text)
        rows = parsed.get("rows") or []
        for r in rows:
            r["pagina"] = pagina
        return rows

    results = await asyncio.gather(
        *[one(p) for p in paginas], return_exceptions=True,
    )
    all_rows: list[dict] = []
    pendentes: list[tuple[int, str]] = []
    for p, r in zip(paginas, results):
        if isinstance(r, Exception):
            pendentes.append((p, str(r)))
        else:
            all_rows.extend(r)

    # 2ª VARREDURA: rate limits dos free tiers são POR MINUTO — pausar e
    # re-tentar sequencialmente as páginas que falharam recupera quase tudo.
    if pendentes:
        print(f"[extract] re-tentando {len(pendentes)} página(s) após pausa…", flush=True)
        progress(f"re-tentando {len(pendentes)} página(s) que falharam (aguardando rate limit)…")
        await asyncio.sleep(10)
        ainda: list[tuple[int, str]] = []
        for p, _msg in pendentes:
            try:
                all_rows.extend(await one(p))
            except Exception as e2:  # noqa: BLE001
                ainda.append((p, str(e2)))
            await asyncio.sleep(3)
        pendentes = ainda

    falhas = [f"página {p}: {m[:120]}" for p, m in pendentes]
    if not all_rows:
        raise ProviderError("Extração por página falhou em todas: " + " | ".join(falhas))

    meta = {
        "anos": periodos,
        "visoes": [str(v) for v in (ident.get("visoes") or [])],
        "unidade": str(ident.get("unidade") or ""),
        "moeda": str(ident.get("moeda") or "BRL"),
        "isBalancete": bool(ident.get("isBalancete")),
        "paginas_bp": ident.get("paginas_bp") or [],
        "paginas_dre": ident.get("paginas_dre") or [],
        "paginas_com_falha": falhas,
    }
    return {"rows": all_rows, "meta": meta, "provider": ident_res.provider}


async def _do_extract(data: bytes, mime: str, progress=_noop) -> dict:
    """Extração completa (duas passadas + fallback + saneamento + portão de
    qualidade). Levanta HTTPException em falha."""
    out = None
    provider = None
    try:
        two = await _extract_two_pass(data, mime, progress)
        if two:
            out = {"rows": two["rows"], "meta": two["meta"]}
            provider = two["provider"]
    except HTTPException:
        raise
    except (ProviderError, json.JSONDecodeError, ValueError) as e:
        print(f"[extract] duas-passadas falhou ({type(e).__name__}): {str(e)[:900]}", flush=True)
        out = None  # cai para o single-shot

    if out is None:
        progress("tentando extração em passada única…")
        try:
            res = await complete_vision(EXTRACT, data, mime, json_mode=True)
            out = parse_json_loose(res.text)
            provider = res.provider
        except ProviderError as e:
            raise HTTPException(503, str(e)) from e
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(502, f"LLM devolveu JSON inválido: {e}") from e

    progress("consolidando resultados…")
    rows = out.get("rows") or []
    # saneamento mínimo: valores numéricos, strings aparadas
    clean: list[dict] = []
    for r in rows:
        if not str(r.get("origem", "")).strip():
            continue
        valores = {}
        for k, v in (r.get("valores") or {}).items():
            try:
                valores[str(k)] = float(v)
            except (TypeError, ValueError):
                continue
        origem = str(r.get("origem", "")).strip()
        # cinto e suspensório: mesmo se o LLM esquecer o isTotal, padrões
        # óbvios de total/subtotal são marcados deterministicamente
        e_total = bool(r.get("isTotal")) or bool(
            re.match(r"^\s*(sub)?tota(l|is)\b", origem, re.IGNORECASE),
        )
        clean.append({
            "origem": origem,
            "hierarquia": str(r.get("hierarquia", "")).strip(),
            "codigo": str(r.get("codigo", "")).strip(),
            "pagina": r.get("pagina"),
            "grupo": str(r.get("grupo", "")).strip(),
            "subCategoria": str(r.get("subCategoria", "")).strip(),
            "isTotal": e_total,
            "valores": valores,
        })
    # PORTÃO DE QUALIDADE: extração de balanço sem valores numéricos é
    # inutilizável (acontece quando só o provedor de emergência respondeu).
    # Falhar honesto > devolver lixo silencioso.
    if len(clean) >= 5:
        cobertura = sum(1 for r in clean if r["valores"]) / len(clean)
        if cobertura < 0.3:
            raise HTTPException(
                502,
                f"Extração de baixa qualidade ({provider}): só "
                f"{cobertura:.0%} das contas vieram com valores — o provedor "
                "principal de visão está sobrecarregado. Tente novamente em "
                "1-2 minutos, ou cole a tabela manualmente.",
            )

    return {"rows": clean, "meta": out.get("meta") or {}, "provider": provider,
            "prompt_version": PROMPT_VERSION}


# ----------------------------------------------------------------------
# Extração como JOB ASSÍNCRONO: proxies de host gratuito (Render) matam
# requisições longas (~100s), e uma extração pode levar minutos. O POST
# devolve um job_id imediatamente; o portal consulta GET /extract/{id}
# a cada poucos segundos (e ainda ganha progresso em tempo real).
# ----------------------------------------------------------------------
JOBS: dict[str, dict] = {}
JOB_TTL_S = 3600


def _prune_jobs() -> None:
    corte = time.time() - JOB_TTL_S
    for jid in [j for j, v in JOBS.items() if v["ts"] < corte]:
        JOBS.pop(jid, None)


async def _run_extract_job(job_id: str, data: bytes, mime: str) -> None:
    job = JOBS[job_id]

    def progress(msg: str) -> None:
        job["progress"] = msg

    try:
        job["result"] = await _do_extract(data, mime, progress)
        job["status"] = "done"
    except HTTPException as e:
        job.update(status="error", code=e.status_code, detail=e.detail)
    except Exception as e:  # noqa: BLE001 — job nunca pode morrer mudo
        job.update(status="error", code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    mime = MIME_BY_EXT.get(ext)
    if not mime:
        raise HTTPException(415, f"Formato .{ext} não suportado (use pdf/png/jpg/webp).")
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Arquivo acima de {MAX_UPLOAD_MB} MB.")

    _prune_jobs()
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"status": "processing", "progress": "na fila…", "ts": time.time()}
    asyncio.create_task(_run_extract_job(job_id, data, mime))
    return {"job_id": job_id, "status": "processing"}


@app.get("/extract/{job_id}")
async def extract_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado (expirou ou a API reiniciou — reenvie o arquivo).")
    if job["status"] == "done":
        return {"status": "done", "result": job["result"]}
    if job["status"] == "error":
        return {"status": "error", "code": job.get("code", 500), "detail": job.get("detail", "")}
    return {"status": "processing", "progress": job.get("progress", "")}


# ----------------------------------------------------------------------
# /julgamental — mapeamento em lote
# ----------------------------------------------------------------------
class JulgamentalIn(BaseModel):
    rows: list[dict]
    plano_contas: list[dict]


@app.post("/julgamental")
async def julgamental(body: JulgamentalIn):
    if not body.rows:
        return {"suggestions": [], "provider": None}
    plano_txt = "\n".join(
        f"- {p.get('destino')} | {p.get('grupo')} | {p.get('subCategoria')}"
        for p in body.plano_contas
    )
    prompt = JULGAMENTAL.format(
        rows=json.dumps(body.rows, ensure_ascii=False, indent=1),
        plano=plano_txt,
    )
    try:
        res = await complete_text(prompt, json_mode=True)
        out = parse_json_loose(res.text)
    except ProviderError as e:
        raise HTTPException(503, str(e)) from e
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(502, f"LLM devolveu JSON inválido: {e}") from e

    # GUARDRAIL determinístico: só aceita destinos que existem no plano
    # com grupo/sub compatíveis — sugestão fora do plano é descartada.
    def _sem_prefixo(s: str) -> str:
        # remove o prefixo de sinal ("-", "+", "+/-") que o LLM às vezes omite
        return re.sub(r"^[\s+\-/]+", "", s)

    valid: dict = {}
    loose: dict = {}
    for p in body.plano_contas:
        n = _norm(p.get("destino"))
        valid[n] = p
        loose.setdefault(_sem_prefixo(n), []).append(p)
    suggestions = []
    for s in out.get("suggestions") or []:
        dest = str(s.get("destino", "")).strip()
        if not dest:
            continue
        p = valid.get(_norm(dest))
        if not p:
            # tolerância a prefixo de sinal omitido, exigindo grupo compatível
            grupo_s = _norm(s.get("grupo", ""))
            cands = [c for c in loose.get(_sem_prefixo(_norm(dest)), [])
                     if not grupo_s or _norm(c.get("grupo")) == grupo_s]
            p = cands[0] if len(cands) == 1 else None
        if not p:
            continue  # alucinação de destino -> descarta
        grupo = str(s.get("grupo", "")).strip() or p.get("grupo")
        if _norm(grupo) != _norm(p.get("grupo")):
            continue  # troca de grupo estrutural -> descarta (regra absoluta)
        suggestions.append({
            "id": s.get("id"),
            "origem": s.get("origem"),
            "destino": p.get("destino"),
            "grupo": p.get("grupo"),
            "subCategoria": p.get("subCategoria"),
            "justificativa": str(s.get("justificativa", "")).strip(),
        })
    return {"suggestions": suggestions, "provider": res.provider,
            "prompt_version": PROMPT_VERSION}


# ----------------------------------------------------------------------
# /parecer — texto executivo
# ----------------------------------------------------------------------
@app.post("/parecer")
async def parecer(resumo: dict):
    prompt = PARECER.format(resumo=json.dumps(resumo, ensure_ascii=False, indent=1))
    try:
        res = await complete_text(prompt, allow_small=True)
    except ProviderError as e:
        raise HTTPException(503, str(e)) from e
    return {"parecer": res.text.strip(), "provider": res.provider,
            "prompt_version": PROMPT_VERSION}

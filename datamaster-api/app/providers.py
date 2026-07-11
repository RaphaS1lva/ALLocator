"""
Roteador de LLMs gratuitas com fallback em cascata.

Ordem por capacidade:
  visão (PDF escaneado/imagem) : Gemini -> OpenRouter (modelos free com visão)
  texto/JSON                   : Gemini -> Groq -> OpenRouter -> HF (ex.: Tucano)

Filosofia: o sistema NUNCA "morre" —
  1. cada provedor é opcional (ativado pela presença da API key no ambiente);
  2. se todos falharem, a API devolve erro claro e o FRONTEND degrada para o
     modo determinístico (memória + dicionário + edição manual), que não
     depende de LLM nenhum.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

# Desenvolvimento local: carrega o .env da pasta datamaster-api/ (as chaves
# ficam fora do git). No HF Spaces/produção as variáveis vêm do host.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

TIMEOUT = httpx.Timeout(120.0, connect=10.0)

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_KEY = os.getenv("GROQ_API_KEY", "")
OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "")
HF_TOKEN = os.getenv("HF_TOKEN", "")

# gemini-2.5-flash: geracao estavel com free tier e visao de PDF. Evitar o
# alias "gemini-flash-latest" (aponta p/ preview, que vive dando 503) e o
# 2.0-flash (deprecado, 429 de cota zero). Se o primario falhar com 429/503,
# tentamos o modelo reserva antes de desistir do Gemini.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash-lite")
GEMINI_COOLDOWN_S = int(os.getenv("GEMINI_COOLDOWN_S", "600"))
_gemini_cooldown_until = 0.0
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
# Modelos de visão free do OpenRouter (jul/2026), tentados em ordem. Upstreams
# DIFERENTES de propósito (Google e NVIDIA): quando um provedor está
# sobrecarregado, o outro costuma responder. Slugs :free mudam com o tempo —
# se todos derem 404, liste os atuais em openrouter.ai/models.
OPENROUTER_VISION_MODELS = [m.strip() for m in os.getenv(
    "OPENROUTER_VISION_MODELS",
    "google/gemma-4-31b-it:free,nvidia/nemotron-nano-12b-v2-vl:free",
).split(",") if m.strip()]
# Modelo brasileiro (Tucano) como último recurso de TEXTO via HF Inference API.
HF_MODEL = os.getenv("HF_MODEL", "TucanoBR/Tucano-2b4-Instruct")
# HF Inference ROUTER (OpenAI-compatível): serve modelos grandes (70B+) via
# provedores parceiros, com créditos mensais gratuitos — entra na cascata
# PRINCIPAL de texto (diferente do Tucano, que é só p/ texto simples).
# Lista CURADA (não-aleatória), tentada em ordem: modelos com capacidade
# comprovada p/ extração estruturada em PT-BR. Editável via env.
HF_CHAT_MODELS = [m.strip() for m in os.getenv(
    "HF_CHAT_MODELS",
    "meta-llama/Llama-3.3-70B-Instruct,"
    "Qwen/Qwen2.5-72B-Instruct,"
    "deepseek-ai/DeepSeek-V3",
).split(",") if m.strip()]
HF_CHAT_MODEL = HF_CHAT_MODELS[0]

# ----------------------------------------------------------------------
# Consumo por provedor (em memória; reinicia com o processo)
# ----------------------------------------------------------------------
USAGE: dict[str, dict] = {}
USAGE_SINCE = time.time()


def _usage_bucket(provider: str) -> dict:
    key = provider.split("[")[0]
    return USAGE.setdefault(key, {
        "requests": 0, "tokens_in": 0, "tokens_out": 0,
        "errors": 0, "last_error": "",
    })


def record_usage(provider: str, tokens_in: int, tokens_out: int) -> None:
    b = _usage_bucket(provider)
    b["requests"] += 1
    b["tokens_in"] += int(tokens_in or 0)
    b["tokens_out"] += int(tokens_out or 0)


def record_error(provider: str, msg: str) -> None:
    b = _usage_bucket(provider)
    b["errors"] += 1
    b["last_error"] = str(msg)[:200]


def get_usage() -> dict:
    return {"since": USAGE_SINCE, "providers": USAGE}


class ProviderError(Exception):
    pass


@dataclass
class LLMResult:
    text: str
    provider: str


def available_providers() -> list[str]:
    out = []
    if GEMINI_KEY:
        out.append(f"gemini:{GEMINI_MODEL}")
    if GROQ_KEY:
        out.append(f"groq:{GROQ_MODEL}")
    if OPENROUTER_KEY:
        out.append(f"openrouter:{OPENROUTER_MODEL}")
    if HF_TOKEN:
        out.append(f"hf-router:{HF_CHAT_MODEL}")
        out.append(f"hf:{HF_MODEL}")
    return out


# ----------------------------------------------------------------------
# Provedores individuais
# ----------------------------------------------------------------------
async def _gemini_once(model: str, body: dict[str, Any]) -> str:
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:generateContent")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as cli:
            r = await cli.post(url, params={"key": GEMINI_KEY}, json=body)
    except httpx.HTTPError as e:
        # erro de REDE vira ProviderError 503 (transitório) -> cascata segue
        record_error("gemini", f"rede: {e}")
        raise ProviderError(f"gemini[{model}] 503: rede: {type(e).__name__} {e}") from e
    if r.status_code != 200:
        record_error("gemini", f"{r.status_code}: {r.text[:120]}")
        raise ProviderError(f"gemini[{model}] {r.status_code}: {r.text[:300]}")
    data = r.json()
    um = data.get("usageMetadata") or {}
    record_usage("gemini", um.get("promptTokenCount", 0), um.get("candidatesTokenCount", 0))
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise ProviderError(f"gemini[{model}] resposta inesperada: {data}") from e


async def _gemini(prompt: str, *, file_bytes: bytes | None = None,
                  mime: str = "", json_mode: bool = False) -> str:
    if not GEMINI_KEY:
        raise ProviderError("GEMINI_API_KEY ausente")
    parts: list[dict[str, Any]] = []
    if file_bytes:
        parts.append({"inline_data": {"mime_type": mime,
                                      "data": base64.b64encode(file_bytes).decode()}})
    parts.append({"text": prompt})
    body: dict[str, Any] = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 65536},
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    # CIRCUIT BREAKER: cota DIÁRIA esgotada não é transitória — insistir só
    # queima tempo. Gemini sai da cascata por alguns minutos.
    global _gemini_cooldown_until
    if time.time() < _gemini_cooldown_until:
        raise ProviderError("gemini em cooldown (cota diária esgotada) — usando os demais provedores")

    # Retentativa ENXUTA (latência importa): primário -> modelo reserva.
    # A resiliência de verdade vem da CASCATA de provedores; insistir muito
    # num provedor instável só deixa a extração lenta.
    plan = [(GEMINI_MODEL, 0.0)]
    if GEMINI_FALLBACK_MODEL and GEMINI_FALLBACK_MODEL != GEMINI_MODEL:
        plan += [(GEMINI_FALLBACK_MODEL, 2.0)]
    last: ProviderError | None = None
    for model, wait in plan:
        if wait:
            await asyncio.sleep(wait)
        try:
            return await _gemini_once(model, body)
        except ProviderError as e:
            msg = str(e)
            # Só cota DIÁRIA abre o cooldown longo. 429 de limite POR MINUTO
            # (RPM/TPM) renova em ~60s — abrir cooldown de 10min para isso
            # desligava nosso melhor provedor à toa.
            diario = " 429:" in msg and ("PerDay" in msg or "per day" in msg or "daily" in msg.lower())
            if diario:
                _gemini_cooldown_until = time.time() + GEMINI_COOLDOWN_S
                raise ProviderError(
                    "gemini: cota diária do free tier esgotada — cascata segue nos demais provedores",
                ) from e
            if " 429:" not in msg and " 503:" not in msg:
                raise
            last = e
    raise last


def pdf_page_texts(data: bytes) -> list[str]:
    """Extrai a CAMADA DE TEXTO embutida de cada página (sem OCR, sem LLM).

    pdfium decodifica corretamente fontes CID/subset (comuns em PDFs
    assinados). Quando o texto existe, a extração vira um problema de TEXTO:
    números exatos, ~90% menos tokens e os provedores de texto (muito mais
    estáveis que visão) entram na cascata.
    """
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    out: list[str] = []
    try:
        for i in range(len(pdf)):
            try:
                out.append(pdf[i].get_textpage().get_text_bounded() or "")
            except Exception:
                out.append("")
    finally:
        pdf.close()
    return out


def text_quality_ok(t: str) -> bool:
    """Página tem texto utilizável? (mínimo de conteúdo E de dígitos)."""
    return len(t) >= 200 and sum(c.isdigit() for c in t) >= 30


def pdf_page_images(data: bytes, pages: list[int], scale: float = 2.0) -> dict[int, bytes]:
    """Renderiza páginas ESPECÍFICAS (1-based) de um PDF em PNGs."""
    import io as _io

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    out: dict[int, bytes] = {}
    try:
        n = len(pdf)
        for p in pages:
            if not (1 <= p <= n):
                continue
            pil = pdf[p - 1].render(scale=scale).to_pil()
            buf = _io.BytesIO()
            pil.save(buf, "PNG")
            out[p] = buf.getvalue()
    finally:
        pdf.close()
    return out


def pdf_to_images(data: bytes, max_pages: int = 8, scale: float = 2.0) -> list[bytes]:
    """Renderiza as páginas de um PDF em PNGs (independe de fontes/OCR).

    Caminho de resiliência: quando o provedor com visão de PDF nativo cai,
    as imagens funcionam em qualquer modelo de visão (OpenRouter/Qwen etc.).
    """
    import io as _io

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    out: list[bytes] = []
    try:
        for i in range(min(len(pdf), max_pages)):
            page = pdf[i]
            pil = page.render(scale=scale).to_pil()
            buf = _io.BytesIO()
            pil.save(buf, "PNG")
            out.append(buf.getvalue())
    finally:
        pdf.close()
    return out


async def _openai_compat(base_url: str, key: str, model: str, prompt: str, *,
                         images: list[tuple[str, str]] | None = None,
                         json_mode: bool = False, name: str = "",
                         max_tokens: int = 16384) -> str:
    """images: lista de (b64, mime) — múltiplas páginas viram múltiplas imagens."""
    if not key:
        raise ProviderError(f"{name}: API key ausente")
    content: Any = prompt
    if images:
        content = [
            *[{"type": "image_url",
               "image_url": {"url": f"data:{mime};base64,{b64}"}} for b64, mime in images],
            {"type": "text", "text": prompt},
        ]
    body: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.0,
        # páginas densas geram JSONs longos — o default de alguns provedores
        # TRUNCA a resposta; mas o teto precisa respeitar o TPM de cada um
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = None
    for tentativa in (1, 2):  # erro de REDE ganha 1 retry curto
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as cli:
                r = await cli.post(f"{base_url}/chat/completions",
                                   headers={"Authorization": f"Bearer {key}"}, json=body)
            break
        except httpx.HTTPError as e:
            if tentativa == 2:
                record_error(name, f"rede: {e}")
                raise ProviderError(f"{name} rede: {type(e).__name__} {e}") from e
            await asyncio.sleep(2)
    if r.status_code != 200:
        record_error(name, f"{r.status_code}: {r.text[:120]}")
        raise ProviderError(f"{name} {r.status_code}: {r.text[:300]}")
    data = r.json()
    u = data.get("usage") or {}
    record_usage(name, u.get("prompt_tokens", 0), u.get("completion_tokens", 0))
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        # alguns gateways devolvem 200 com corpo de erro (rate limit etc.)
        record_error(name, f"resposta inesperada: {str(data)[:120]}")
        raise ProviderError(f"{name} resposta inesperada: {str(data)[:300]}") from e


GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")


async def _groq(prompt: str, json_mode: bool = False) -> str:
    # max_tokens conta no TPM do Groq free (~6k): pedir 16k = rejeição imediata.
    # Os limites do Groq são POR MODELO: quando o orçamento diário do 70B
    # esgota, o 8b-instant tem verba separada (500k tokens/dia) — qualidade
    # menor, mas o detector de degeneração barra resultado ruim.
    try:
        return await _openai_compat("https://api.groq.com/openai/v1", GROQ_KEY,
                                    GROQ_MODEL, prompt, json_mode=json_mode, name="groq",
                                    max_tokens=4096)
    except ProviderError as e:
        if " 429:" not in str(e) or not GROQ_FALLBACK_MODEL:
            raise
        return await _openai_compat("https://api.groq.com/openai/v1", GROQ_KEY,
                                    GROQ_FALLBACK_MODEL, prompt, json_mode=json_mode,
                                    name=f"groq[{GROQ_FALLBACK_MODEL}]", max_tokens=4096)


async def _hf_router(prompt: str, json_mode: bool = False) -> str:
    """Hugging Face Inference Router — modelos grandes open-source via
    OpenAI-compat, com créditos mensais gratuitos. Tenta a lista CURADA em
    ordem (determinística — nada de modelo aleatório)."""
    errors: list[str] = []
    for model in HF_CHAT_MODELS:
        try:
            # json_mode DESLIGADO de propósito: o response_format do router
            # degenera a saída do Llama (todas as origens iguais); o prompt
            # já exige JSON e o parse_json_loose tolera texto ao redor.
            return await _openai_compat("https://router.huggingface.co/v1", HF_TOKEN,
                                        model, prompt, json_mode=False,
                                        name=f"hf-router[{model}]", max_tokens=8192)
        except ProviderError as e:
            errors.append(str(e)[:160])
    raise ProviderError(" | ".join(errors))


async def _openrouter(prompt: str, *, images: list[tuple[str, str]] | None = None,
                      json_mode: bool = False) -> str:
    if not images:
        # texto: apenas o modelo CONFIGURADO (nada de "openrouter/free"
        # aleatório — qualidade imprevisível derruba a extração)
        return await _openai_compat("https://openrouter.ai/api/v1", OPENROUTER_KEY,
                                    OPENROUTER_MODEL, prompt, json_mode=json_mode,
                                    name="openrouter")
    errors: list[str] = []
    for model in OPENROUTER_VISION_MODELS:
        try:
            return await _openai_compat("https://openrouter.ai/api/v1", OPENROUTER_KEY,
                                        model, prompt, images=images,
                                        json_mode=json_mode, name=f"openrouter[{model}]")
        except ProviderError as e:
            errors.append(str(e)[:200])
    raise ProviderError(" | ".join(errors))


async def _hf(prompt: str) -> str:
    """Último recurso de texto: HF Inference API (ex.: Tucano, PT-BR).

    Modelos pequenos (1-2B) servem para redigir texto simples (parecer),
    NÃO para julgamento contábil — o roteador só chega aqui se todos os
    provedores maiores falharem.
    """
    if not HF_TOKEN:
        raise ProviderError("HF_TOKEN ausente")
    url = f"https://api-inference.huggingface.co/models/{HF_MODEL}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as cli:
            r = await cli.post(url, headers={"Authorization": f"Bearer {HF_TOKEN}"},
                               json={"inputs": prompt,
                                     "parameters": {"max_new_tokens": 800,
                                                    "temperature": 0.1,
                                                    "return_full_text": False}})
    except httpx.HTTPError as e:
        raise ProviderError(f"hf rede: {type(e).__name__} {e}") from e
    if r.status_code != 200:
        raise ProviderError(f"hf {r.status_code}: {r.text[:300]}")
    data = r.json()
    if isinstance(data, list) and data and "generated_text" in data[0]:
        return data[0]["generated_text"]
    raise ProviderError(f"hf resposta inesperada: {str(data)[:300]}")


# ----------------------------------------------------------------------
# Roteador
# ----------------------------------------------------------------------
async def complete_text(prompt: str, *, json_mode: bool = False,
                        allow_small: bool = False) -> LLMResult:
    """Texto/JSON com fallback: Gemini -> Groq -> OpenRouter -> HF."""
    errors: list[str] = []
    chain = [
        ("gemini", lambda: _gemini(prompt, json_mode=json_mode)),
        ("groq", lambda: _groq(prompt, json_mode=json_mode)),
    ]
    if HF_TOKEN:
        # HF (lista curada de modelos 70B+) ANTES do OpenRouter :free, que
        # congestiona com frequência — a tarefa TEM que terminar bem
        chain.append(("hf-router", lambda: _hf_router(prompt, json_mode=json_mode)))
    chain.append(("openrouter", lambda: _openrouter(prompt, json_mode=json_mode)))
    if allow_small:
        chain.append(("hf", lambda: _hf(prompt)))
    for name, fn in chain:
        try:
            return LLMResult(text=await fn(), provider=name)
        except ProviderError as e:
            errors.append(str(e))
    raise ProviderError("Todos os provedores falharam: " + " | ".join(errors))


async def complete_vision(prompt: str, file_bytes: bytes, mime: str,
                          *, json_mode: bool = True) -> LLMResult:
    """Visão com fallback em 2 estágios:
    1. Gemini nativo (PDF ou imagem, com retry + modelo reserva);
    2. OpenRouter (Qwen VL free) — PDFs são RENDERIZADOS em imagens no
       servidor, então nenhum formato depende de um provedor único.
    """
    errors: list[str] = []
    try:
        return LLMResult(
            text=await _gemini(prompt, file_bytes=file_bytes, mime=mime,
                               json_mode=json_mode),
            provider="gemini",
        )
    except ProviderError as e:
        errors.append(str(e))

    try:
        if mime == "application/pdf":
            pages = pdf_to_images(file_bytes)
            images = [(base64.b64encode(p).decode(), "image/png") for p in pages]
        else:
            images = [(base64.b64encode(file_bytes).decode(), mime)]
        # json_mode desligado: nem todo endpoint free aceita response_format;
        # o prompt exige JSON e o parse_json_loose tolera cercas de código.
        return LLMResult(
            text=await _openrouter(prompt, images=images, json_mode=False),
            provider="openrouter",
        )
    except ProviderError as e:
        errors.append(str(e))
    except Exception as e:  # falha na renderização do PDF
        errors.append(f"render pdf: {e}")
    raise ProviderError("Visão indisponível: " + " | ".join(errors))


def parse_json_loose(text: str) -> Any:
    """Aceita JSON puro, cercado por ```json ...``` ou com texto extra
    antes/depois (raw_decode pega o PRIMEIRO objeto completo)."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = min((i for i in (text.find("{"), text.find("[")) if i >= 0),
                    default=-1)
        if start < 0:
            raise
        obj, _end = json.JSONDecoder().raw_decode(text[start:])
        return obj

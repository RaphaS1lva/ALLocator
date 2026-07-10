---
title: DataMaster Allocator API
emoji: 📊
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# DataMaster · Allocator API

Camada de IA do portal DataMaster (o pipeline contábil determinístico roda no
frontend — esta API cuida apenas do que exige LLM):

| Endpoint | Função | Provedores (fallback em cascata) |
|---|---|---|
| `POST /extract` | PDF escaneado/imagem → contas estruturadas (JSON) | Gemini → OpenRouter (visão) |
| `POST /julgamental` | Sugere destino p/ contas não mapeadas, com guardrail estrutural | Gemini → Groq → OpenRouter |
| `POST /parecer` | Parecer executivo em linguagem natural | Gemini → Groq → OpenRouter → HF (Tucano) |
| `GET /health` | Status + provedores ativos | — |

## Variáveis de ambiente (Settings → Variables and secrets no Space)

| Nome | Obrigatória | Onde obter (grátis) |
|---|---|---|
| `GEMINI_API_KEY` | recomendada (única com visão p/ PDF) | https://aistudio.google.com/apikey |
| `GROQ_API_KEY` | opcional | https://console.groq.com/keys |
| `OPENROUTER_API_KEY` | opcional | https://openrouter.ai/keys |
| `HF_TOKEN` | opcional (Tucano/último recurso de texto) | https://huggingface.co/settings/tokens |
| `ALLOWED_ORIGINS` | recomendada | ex.: `https://SEUUSUARIO.github.io` |

Sem nenhuma chave a API sobe normalmente e devolve `503` com mensagem clara —
o portal degrada para o modo determinístico (memória + dicionário + revisão
manual).

## Rodar localmente

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8123
# http://127.0.0.1:8123/docs
```

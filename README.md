# ALLocator — Planilhamento de Balanços com IA

Plataforma que lê demonstrações financeiras (PDF, imagem, Excel, balancete),
aloca as contas em um plano de contas padronizado com **camadas
determinísticas + LLM** e entrega o Excel final com QA contábil
(`Ativo = Passivo + PL` como regra bloqueante) — evolução de um CustomGPT
para um produto completo. Case do programa **DataMaster — Engenharia de IA**.

## Arquitetura

```
GitHub Pages (React)  ──►  FastAPI (Render)  ──►  LLMs gratuitas em cascata
      │                       │                   Gemini → Groq → OpenRouter → HF
      ▼                       ▼
  Supabase (auth + RLS + memória anterior + dicionário dinâmico)
```

- **Pipeline determinístico no navegador**: matching por memória anterior →
  dicionário (1.285 regras + aprendizado contínuo) → regras de sinal →
  Shadow → QA. Funciona até sem LLM.
- **Extração texto-first**: camada de texto do PDF via pdfium (números
  exatos, ~90% menos tokens); visão computacional só para páginas
  escaneadas. Duas passadas: identificar páginas/visões/períodos → extrair
  página a página.
- **Resiliência**: cascata de 5 provedores, circuit breaker de cota,
  retry com backoff, guardrails estruturais server-side e portão de
  qualidade (falha honesta > lixo silencioso).
- **Acurácia medida**: eval harness com golden dataset
  ([`datamaster-api/eval/`](datamaster-api/eval/)) — recall 100% e
  acurácia de valores 99,2% no ITR real da Fleury.

| Pasta | O que é |
|---|---|
| [`datamaster-portal/`](datamaster-portal/) | Frontend React (Vite) — fluxo guiado conversacional em 4 etapas |
| [`datamaster-api/`](datamaster-api/) | API FastAPI — extração, julgamental, parecer, consumo |
| [`supabase/`](supabase/) | Schema Postgres com RLS + trigger de aprendizado do dicionário |
| [`datamaster-app/`](datamaster-app/) | Protótipo v0 (vanilla JS, offline) — histórico da evolução |
| [`SETUP.md`](SETUP.md) | Passo a passo completo de implantação (gratuita) |

## Rodar localmente

```bash
# Portal (modo demo sem configurar nada): http://localhost:5173
cd datamaster-portal && npm install && npm run dev

# API de IA (chaves em datamaster-api/.env — ver .env.example)
cd datamaster-api && pip install -r requirements.txt
uvicorn app.main:app --port 8123
```

Guia completo (Supabase, chaves de LLM, Render, GitHub Pages): [SETUP.md](SETUP.md).

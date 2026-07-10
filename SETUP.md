# DataMaster · Allocator — Guia de implantação (passo a passo)

Três peças, três serviços gratuitos:

| Peça | Onde roda | Custo |
|---|---|---|
| **Portal** (`datamaster-portal/`) — React + Vite | GitHub Pages | R$ 0 |
| **Banco + Auth** (`supabase/schema.sql`) | Supabase free tier | R$ 0 |
| **API de IA** (`datamaster-api/`) — FastAPI | Hugging Face Spaces (Docker) | R$ 0 |

Ordem recomendada: **1 Supabase → 2 chaves de LLM → 3 HF Spaces → 4 GitHub Pages**.
O portal funciona parcialmente sem os passos 2-3 (modo determinístico) e sem o
passo 1 (modo demo com localStorage) — dá para implantar aos poucos.

---

## 1. Supabase (login + banco + memória anterior)

1. Crie conta em https://supabase.com → **New project** (região `South America (São Paulo)`).
2. Aguarde provisionar. No menu lateral, abra **SQL Editor** → **New query**.
3. Cole TODO o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique **Run**.
   Isso cria as tabelas (`clientes`, `analises`, `dicionario`, `dicionario_log`),
   as políticas de **RLS** (cada usuário só vê os próprios dados), o **trigger de
   aprendizado do dicionário** e a view de memória anterior.
4. Em **Authentication → Sign In / Up**, deixe **Email** habilitado.
   *Opcional para demo:* desabilite **Confirm email** para o cadastro entrar direto.
5. Copie as credenciais (o painel novo do Supabase separou em duas páginas —
   engrenagem **Project Settings**, seção *Configuration*):
   - **Data API** → `Project URL` → será o `VITE_SUPABASE_URL`
   - **API Keys** → **Publishable key** (`sb_publishable_...`) → será o
     `VITE_SUPABASE_ANON_KEY`. Se preferir o formato antigo, a aba
     **Legacy API keys** ainda traz a `anon public` (`eyJ...`) — ambas funcionam.

> A publishable/anon key pode aparecer no bundle do frontend sem risco: quem
> manda é o RLS. **Nunca** exponha as *Secret keys* (`sb_secret_...`) nem a
> antiga `service_role`.

## 2. Chaves de LLM gratuitas (para a API de IA)

| Provedor | Papel | Onde criar a chave |
|---|---|---|
| **Google Gemini** | principal — é o único com **visão de PDF** (escaneados) | https://aistudio.google.com/apikey |
| **Groq** (Llama 3.3 70B) | fallback rápido de texto | https://console.groq.com/keys |
| **OpenRouter** (modelos `:free`) | fallback de texto e de visão p/ imagem | https://openrouter.ai/keys |
| **Hugging Face token** | último recurso de texto (ex.: **Tucano**, PT-BR) | https://huggingface.co/settings/tokens |

Basta a do Gemini para tudo funcionar; as demais aumentam a resiliência
(a API tenta em cascata: Gemini → Groq → OpenRouter → HF).

## 3. API no Hugging Face Spaces

1. Crie conta em https://huggingface.co → **New Space**.
   - Space name: `datamaster-api` · License: mit · **SDK: Docker** · Hardware: CPU basic (free).
2. Envie o **conteúdo da pasta `datamaster-api/`** para o Space (upload pela web
   ou `git push` — o Space é um repositório git):
   ```bash
   git clone https://huggingface.co/spaces/SEUUSUARIO/datamaster-api
   # copie Dockerfile, requirements.txt, README.md e a pasta app/ para dentro
   git add . && git commit -m "API DataMaster" && git push
   ```
3. No Space: **Settings → Variables and secrets** → adicione como *Secrets*:
   - `GEMINI_API_KEY` (e as demais que você criou no passo 2)
   - `ALLOWED_ORIGINS` = `https://SEUUSUARIO.github.io` (variable, não secret)
4. Aguarde o build. Teste: `https://SEUUSUARIO-datamaster-api.hf.space/health`
   deve responder `{"status":"ok","providers":[...]}`.

> **Render como alternativa:** funciona igual (Web Service → Docker), mas o free
> tier hiberna após 15 min sem tráfego — ruim para demo ao vivo. Se usar Render,
> abra a URL `/health` alguns minutos antes da apresentação para "acordar" a API.

## 4. Portal no GitHub Pages

1. Crie um repositório no GitHub (ex.: `datamaster`) e envie esta pasta:
   ```bash
   cd C:\Users\rapha\Documents\DataMaster
   git init
   git add .
   git commit -m "Plataforma DataMaster Allocator"
   git branch -M main
   git remote add origin https://github.com/SEUUSUARIO/datamaster.git
   git push -u origin main
   ```
2. No repositório: **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret** (3x):
   - `VITE_SUPABASE_URL` (passo 1)
   - `VITE_SUPABASE_ANON_KEY` (passo 1)
   - `VITE_API_URL` = `https://SEUUSUARIO-datamaster-api.hf.space` (passo 3)
4. O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) roda
   sozinho a cada push em `datamaster-portal/` (ou dispare manualmente em
   **Actions → Deploy portal → Run workflow**).
5. Portal no ar em `https://SEUUSUARIO.github.io/datamaster/`.

## 5. Desenvolvimento local

```powershell
# Portal (http://localhost:5173) — sem .env.local roda em MODO DEMO
cd datamaster-portal
npm install
npm run dev

# Com Supabase/API locais: copie .env.example para .env.local e preencha

# API (http://127.0.0.1:8123/docs) — jeito fácil: duplo clique em
#   datamaster-api\iniciar-api.bat   (deixe a janela aberta)
# ou manualmente:
cd ..\datamaster-api
pip install -r requirements.txt
uvicorn app.main:app --port 8123
# as chaves são lidas do arquivo datamaster-api\.env
```

---

## Arquitetura de resiliência (por que o sistema "não morre")

1. **Camada determinística primeiro**: memória anterior + dicionário (1.285
   regras + aprendidas) rodam **no navegador**, sem LLM. Upload de xlsx/csv/PDF
   editável, alocação automática, QA e export de Excel funcionam mesmo com a
   API fora do ar.
2. **Cascata de provedores na API**: Gemini → Groq → OpenRouter → HF. Cada um
   é opcional; o `/health` informa quais estão ativos.
3. **Guardrails de código**: sugestão de LLM que aponte para destino fora do
   plano de contas ou troque grupo estrutural é **descartada pelo servidor**
   (não confie no prompt; valide na saída).
4. **Modo demo**: sem Supabase configurado o portal persiste em localStorage —
   a apresentação sobrevive até sem internet (exceto extração por visão).

### Sobre usar o Tucano (modelos abertos em PT-BR)

O Tucano (TucanoBR, 160M–2,4B parâmetros) **está integrado** como último
recurso de texto via HF Inference API (`HF_TOKEN` + `HF_MODEL`). Use-o com
expectativa correta:

- ✅ **Bom para**: redigir o parecer executivo (texto simples em PT-BR) quando
  todos os provedores grandes falharem; discurso de soberania/custo na banca.
- ❌ **Não serve para**: mapeamento julgamental ou extração de documentos —
  modelos de 1-2B erram classificação contábil com frequência inaceitável, não
  seguem JSON schema de forma confiável e não têm visão.
- ⚠️ A Inference API gratuita tem *cold start* (o modelo pode levar ~1 min para
  "acordar") e nem todo modelo fica disponível no tier serverless. Alternativa:
  hospedar o Tucano dentro do próprio Space (CPU) — latência alta, mas 100% sob
  seu controle. Para a demo, trate como diferencial narrado, não como caminho
  crítico.

> Resumo da estratégia: **o "sistema não morrer" vem do design (camada
> determinística + cascata + guardrails), não de nenhum modelo específico.**

# ALLocator — Arquitetura e Decisões Técnicas

> Documento de referência para a banca do case **DataMaster — Engenharia de IA**.
> Complementa o [README](../README.md) (visão geral) e o [SETUP](../SETUP.md)
> (implantação reprodutível).

## 1. O problema

Analistas de crédito recebem demonstrações financeiras em formatos
heterogêneos (PDF auditado, balancete, Excel, imagem) e precisam
"planilhá-las": alocar cada conta em um plano de contas padronizado de 79
posições, respeitando ~1.400 linhas de regras contábeis (sinal, hierarquia,
anti-dupla-contagem, `Ativo = Passivo + PL` como regra bloqueante). A
solução anterior era um CustomGPT: inteligente, porém sem persistência,
sem multiusuário, sem métricas e com regras críticas dependendo de
"obediência do prompt".

## 2. Princípio central: LLM como componente, não como sistema

A engenharia reversa do CustomGPT mostrou que **~80% da lógica é
determinística**. A arquitetura reflete isso — o LLM entra em exatamente
quatro fronteiras, todas cercadas por código:

| Fronteira | Por que precisa de LLM | Guardrail determinístico |
|---|---|---|
| Extração do documento | layout livre, linguagem natural | texto embutido via pdfium (números exatos); detector de degeneração; portão de cobertura de valores |
| Entrevista de confirmação | diálogo com o usuário | protocolo fixo de perguntas (Guia §5), opções fechadas |
| Mapeamento julgamental | contas fora do dicionário | servidor descarta destino fora do plano ou com grupo trocado |
| Parecer executivo | texto para humanos | apenas informativo — nunca altera dados |

Todo o resto — matching por memória/dicionário, regra de sinal (§14),
chaves estruturais, Shadow, QA, KPIs — roda como **código puro no
navegador**, recalculado a cada edição. O sistema funciona (degradado,
mas correto) sem nenhum LLM disponível.

## 3. Visão de componentes

```
┌─────────────────────────┐     ┌──────────────────────────────┐
│  GitHub Pages (React)   │────►│  FastAPI (Render, free)      │
│  · fluxo em 4 etapas    │     │  · /extract (job assíncrono) │
│  · pipeline contábil    │     │  · /julgamental (+guardrail) │
│    100% client-side     │     │  · /parecer · /usage         │
│  · recálculo instantâneo│     └──────────┬───────────────────┘
└──────────┬──────────────┘                │ cascata de LLMs free
           │                   Gemini → Groq(Llama→Kimi→8b) →
           ▼                   HF curado(Llama70B/Qwen72B/DeepSeek) → OpenRouter
┌─────────────────────────┐
│  Supabase (free)        │    Auth · Postgres+RLS · memória anterior
│                         │    dicionário dinâmico (trigger de aprendizado)
└─────────────────────────┘
```

**Fluxo do usuário**: Upload → *Confirmação conversacional* (visão
Controladora/Consolidado, páginas de BP/DRE, períodos a planilhar,
unidade/moeda, validação do Lucro Líquido — protocolo idêntico ao do
CustomGPT) → *Revisão* (layout Shadow com memória anterior/atual,
adicionar/retirar contas, KPIs e drivers ao vivo) → *Resultado* (parecer,
Excel, salvamento que ensina o dicionário).

## 4. Extração: texto-first em duas passadas

1. **Camada de texto local** (pypdfium2): sem OCR e sem LLM, decodifica
   inclusive fontes CID de PDFs assinados. Números chegam **exatos** ao
   modelo — elimina o erro de leitura visual — e o custo cai ~90%
   (≈6 mil tokens de entrada para um ITR de 43 páginas).
2. **Passada 1 — IDENTIFY**: um resumo por página localiza onde estão BP e
   DRE (excluindo DMPL/DFC/DVA/notas), as **visões** e os rótulos de
   período ("Consolidado 31/03/2026").
3. **Passada 2 — extração página a página**: chamadas pequenas não truncam
   e garantem captura completa; páginas sem texto (escaneadas) são
   renderizadas em imagem e vão para visão computacional.
4. **Varreduras de recuperação** (35s/60s) re-tentam páginas que falharam,
   respeitando a janela de renovação dos rate limits.

## 5. Resiliência com free tier (o sistema não morre)

- **Cascata de provedores** com upstreams independentes; modelos fixos e
  curados (nada de roteamento aleatório).
- **Circuit breaker** de cota diária (429/min ≠ 429/dia — só o segundo
  abre cooldown) e retentativa enxuta: a resiliência vem da cascata, não
  da insistência.
- **Orçamentos por modelo**: no Groq, Llama-70B, Kimi K2 e 8b-instant têm
  verbas diárias separadas — a escada quase triplica a capacidade útil.
- **Falha honesta**: portão de qualidade (cobertura de valores), detector
  de extração degenerada (origens repetidas) e aviso explícito de páginas
  não extraídas. Lixo silencioso nunca vira resultado.
- **Job assíncrono**: proxies de host gratuito matam requisições longas
  (~100s); `/extract` devolve `job_id` e o portal acompanha o progresso.
- **Painel de consumo** (`/usage` + card no portal): requisições, tokens e
  erros por provedor contra os limites de cada free tier.

## 6. Acurácia medida (eval harness)

`datamaster-api/eval/` contém um golden dataset transcrito à mão (ITR
Fleury 1T26, visão consolidada: 50 linhas de BP + 15 de DRE) e um script
que mede recall de contas, acurácia de valores célula a célula e
vazamentos de escopo:

| Métrica | Resultado (API em produção no Render) |
|---|---|
| Recall de contas | **98,5%** (64/65) |
| Acurácia de valores | **100%** (127/127 células) |
| Vazamentos de escopo (DMPL/DFC/notas/outra visão) | 0–1 (cosmético: conta zerada vira contexto) |

O eval é reexecutável em um comando e serviu de motor do desenvolvimento:
cada queda de métrica virou correção rastreável (ver histórico de commits).

## 7. Decisões e trade-offs (resumo)

| Decisão | Alternativa rejeitada | Motivo |
|---|---|---|
| Workflow orquestrado com etapas de LLM | Multiagente autônomo | fluxo é conhecido e auditável; agentes livres adicionam não-determinismo onde crédito exige reprodutibilidade |
| Pipeline contábil no navegador | Tudo no backend | recálculo instantâneo na revisão; funciona offline; backend gratuito fica leve |
| Texto-first (pdfium) | OCR/visão para tudo · Docling | números exatos e ~90% menos tokens; Docling agregaria layout de tabela ao custo de ~2GB de PyTorch (anotado como evolução) |
| Supabase com RLS acessado do frontend | API própria de CRUD | menos superfície para manter; anon key é segura por design (RLS) |
| Render para a API | HF Spaces (Docker virou pago) · Cloud Run (exige cartão) | zero fricção; cold start mitigado por ping externo e job assíncrono |
| Excel client-side (valores calculados) | openpyxl com template vivo | sem dependência de backend p/ exportar; o gerador Python original fica como evolução para fórmulas nativas |

## 8. Segurança, privacidade e responsabilidade

- Chaves de LLM só no backend (frontend em Pages é código público).
- RLS por usuário; balanços de clientes fora do repositório público.
- Free tiers podem usar dados para treino: documentado como limitação de
  MVP; produção real usaria tier pago ou modelo self-hosted.
- IA nunca decide sozinha: alocação julgamental é marcada, justificada e
  revisável; totais e áreas protegidas têm travas de código; a entrega é
  bloqueada sem `Ativo = Passivo + PL`.

## 9. Próximos passos

1. Matching semântico (pgvector no Supabase) entre dicionário e julgamental.
2. Export Python de alta fidelidade (template com fórmulas vivas) como
   serviço no backend.
3. MarkItDown/Docling para entradas `.docx`/`.pptx` e tabelas complexas.
4. Compactação da saída da extração (arrays em vez de JSON verboso, ~-40%
   de tokens de output).
5. Observabilidade de LLM (Langfuse) e persistência do consumo no Supabase.
6. Tier pago opcional (Gemini billing ou HF PRO) — troca de uma variável
   de ambiente, sem mudança de arquitetura.

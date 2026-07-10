# DataMaster · Allocator (BP & DRE → Plano de Contas)

Front-end que replica, **sem ChatGPT e sem OCR**, o pipeline contábil do CustomGPT:
você **digita as contas** do Balanço (BP) e da DRE, o app faz **classificação,
matching, regras de sinal, montagem da Rastreabilidade, cálculo do Shadow e QA**
100% no navegador, **persiste** o trabalho e **atualiza o Dicionário de Contas
dinamicamente** (aprende a cada alocação confirmada).

> Construído em **JavaScript puro, sem dependências / sem build**, porque a rede
> corporativa bloqueia `npm`/`pip` (proxy retorna 403 no registry público e falha
> de certificado). O código é **modular** para migrar depois para React + Supabase
> numa máquina com internet (veja "Migração").

---

## Como rodar (nesta máquina)

Não precisa instalar nada. Requer apenas Python (para servir) e um navegador.

```powershell
cd datamaster-app
python -m http.server 8765
# abra http://localhost:8765 no navegador
```

Clique em **"Inserir exemplo"** na aba *Entrada de contas* para ver o fluxo completo
(Shadow fechando Ativo = Passivo + PL, Parecer, exportação de Excel).

### Testes (Node, sem dependências)

```powershell
npm test          # core + UI + persistência + import + PDF  (72 checks)  (ou:)
node test/core.test.mjs     # regras de sinal, matching, Ativo=Passivo+PL (26 checks)
node test/ui.smoke.mjs      # render das 5 telas com shim de DOM (6)
node test/db.test.mjs       # salvar -> aprender dicionário -> reusar memória (9)
node test/import.test.mjs   # leitura de .xlsx real + mapeamento de colunas (17)
node test/pdf.test.mjs      # extração de PDF editável (plano + FlateDecode) (14)
```

---

## Fluxo de uso

1. **Cabeçalho** — empresa, CNPJ, grupo, modelo, unidade/moeda e **anos** (até 3;
   o mais recente vai para *Ano 3*, alinhado à direita, igual ao template). Marque
   *"é balancete"* se a fonte for balancete bruto (ativa a conversão de sinal §14.2).
2. **Entrada de contas** — grid editável (substitui o OCR). Digite Origem, Hierarquia
   (pai), Grupo, Sub, valores por ano, Destino (deixe vazio para o app sugerir) e
   Alocação (Sim/Não). Botão **Auto-alocar** preenche os destinos vazios.
3. **Shadow** — Balanço e DRE calculados ao vivo, com o indicador **Ativo = Passivo + PL**.
4. **Parecer / QA** — validações (dupla contagem, irmãos divergentes, promoção de
   totalizador, cobertura, sinal, equilíbrio patrimonial) + resumo.
5. **Dicionário** — regras (seed + aprendidas/manuais), busca e log de aprendizado.
6. **Salvar** (persiste + ensina o dicionário) e **Exportar Excel** (.xlsx).

### Importar contas (opcional)

Na aba *Entrada de contas*, botão **"⭱ Importar"**: escolha o arquivo (ou cole do
Excel) e o app **detecta tudo automaticamente** (nome da conta + colunas de valor/ano),
mostra uma **prévia** e importa em **um clique** — já **preenchendo os destinos
automaticamente** (Memória → Dicionário). Sem cabeçalho reconhecível (comum em PDF),
usa o modo **posicional** (texto à esquerda = conta; números à direita = valores por
período). O botão **"Ajustar colunas (avançado)"** abre o mapeamento manual, se precisar.

| Formato | Offline (aqui) | Observação |
|---|---|---|
| `.xlsx` / `.xlsm` | ✅ | Lido nativamente (ZIP+OOXML via `DecompressionStream`) |
| `.csv` / colar do Excel | ✅ | Detecta `;`, `,` ou tab |
| **PDF editável** (texto selecionável) | ✅ *(best-effort)* | Extraio o texto embutido (`pdf-text.js`), decodifico via **`/ToUnicode`** da fonte (corrige subconjuntos) e reconstruo linhas/colunas pela posição. **Sem OCR.** Fontes **sem** `/ToUnicode` (só `/Differences`) ainda podem sair imperfeitas |
| `.xls` (binário) | ❌ | Salve como `.xlsx` |
| PDF escaneado / imagem | ❌ | Não tem texto → precisa de **OCR**, indisponível offline. Há o **hook** `setOcrProvider()` em `src/import/readers.js` para habilitar (Tesseract.js/OCR em nuvem) após a migração |

> **Por que não Tesseract embutido?** O motor de OCR (~2–15 MB de WASM + dados treinados) só vem de CDN/npm, bloqueados pelo proxy. E OCR só é necessário para **imagem/PDF escaneado** — PDFs *editáveis* não precisam dele (o texto já está lá).

Se a coluna `Grupo` faltar mas houver **código contábil**, o grupo é inferido pelo
1º dígito (§8.7: 1=Ativo, 2=Passivo/PL, 3/4=DRE).

---

## Arquitetura

```
datamaster-app/
├─ index.html                      # shell da SPA
├─ src/
│  ├─ core/                        # LÓGICA PURA (reutilizável em React depois)
│  │  ├─ normalize.js              # normalize_text, tokens, Jaccard, coerceNumber
│  │  ├─ classify.js               # grupo/sub canônicos, contas de PL, DRE
│  │  ├─ sign.js                   # §14.1 (prefixo), §14.2 (balancete), 1º dígito do código
│  │  ├─ matching.js               # Memória → Dicionário → Julgamental (limiar 0.60)
│  │  ├─ hierarchy.js              # totalizador, hierarquia, Alocação (Sim/Não)
│  │  ├─ keys.js                   # chave estrutural Destino|Grupo|Sub, Chave/Chave Destino
│  │  ├─ planoContas.js            # helpers do Plano de Contas (ordem, destinos válidos)
│  │  ├─ rastreabilidade.js        # anos alinhados, finalização das 14 colunas, ordenação
│  │  ├─ shadow.js                 # agregação (SUMIFS), subtotais, Ativo=Passivo+PL
│  │  ├─ qa.js                     # todas as validações + parecer
│  │  └─ index.js                  # orquestrador do pipeline (runPipeline)
│  ├─ data/                        # SEEDS gerados do template/dicionário reais
│  │  ├─ planoContas.seed.js       # 79 contas + 28 subtotais (Ativo/Passivo/PL/DRE)
│  │  ├─ dicionario.seed.js        # 1285 regras Origem→Destino
│  │  └─ shadowCompute.seed.js     # estrutura de cálculo (agg/subtotais) da Shadow
│  ├─ db/                          # PERSISTÊNCIA (adaptadores plugáveis)
│  │  ├─ repository.js             # fábrica + contrato + aprendizado do dicionário
│  │  ├─ indexeddb.js              # adaptador padrão (offline, navegador)
│  │  ├─ supabase.js               # adaptador REST (fetch) p/ quando migrar à nuvem
│  │  └─ schema.sql                # schema Postgres + TRIGGER de dicionário automático
│  ├─ excel/                       # EXPORTAÇÃO .xlsx sem dependências
│  │  ├─ xlsx.js                   # escritor mínimo de ZIP + OOXML (CRC32, inline strings)
│  │  └─ exportWorkbook.js         # abas Rastreabilidade/Shadow/Base de dados/Dicionário
│  ├─ import/                      # IMPORTAÇÃO (xlsx/xlsm/csv/colar/PDF editável)
│  │  ├─ unzip.js                  # leitor de ZIP + inflate (DecompressionStream)
│  │  ├─ xlsx-read.js              # parser OOXML -> {sheets:[{name,rows}]}
│  │  ├─ pdf-text.js               # extrai texto de PDF EDITÁVEL (streams + operadores de texto)
│  │  ├─ readers.js                # dispatcher por formato + hook de OCR (setOcrProvider)
│  │  └─ mapping.js                # auto-detecção de colunas/anos/linha-cabeçalho -> grid
│  └─ ui/                          # TELAS (vanilla)
│     ├─ app.js                    # controlador (estado, abas, ações)
│     ├─ dom.js, styles.css
│     └─ views/{header,entrada,shadow,parecer,dicionario}.js
├─ test/                           # testes Node (sem deps)
└─ _assets_extracted/              # scripts Python que extraíram os seeds do template/dicionário
```

### Regras portadas do CustomGPT (fielmente)
- **Ordem de alocação:** Memória Anterior → Dicionário → Julgamental (matching por
  texto normalizado + índice de Jaccard, limiar **0.60**, mesmos desempates do `.py`).
- **Sinal:** prefixo do destino (`-`/`+` → |OCR|; `+/-`/sem prefixo → preserva);
  balancete → `saldo × sinal_grupo` (Ativo +1; Passivo/PL/DRE −1); 1º dígito do código.
- **Chave estrutural obrigatória:** `Destino no Template | Grupo | Sub Categoria`.
- **Anti-dupla-contagem:** só linhas `Alocação = Sim` geram Chave e contam no Shadow.
- **Equilíbrio:** `Ativo = Passivo + PL` (subtotais calculados a partir das fórmulas reais do template).

---

## Persistência e Dicionário dinâmico

- **Agora (offline):** `IndexedDBRepository` guarda análises, dicionário aprendido/manual
  e o log. Ao **salvar**, cada linha `Alocação = Sim` com destino **cria/atualiza** a regra
  `Origem→Destino` no dicionário (aprendizado automático). Análises da **mesma empresa (CNPJ)**
  viram *Memória Anterior* e são reusadas no matching.
- **Depois (nuvem):** `SupabaseRepository` implementa o **mesmo contrato** via REST/`fetch`
  (sem o pacote npm). O aprendizado também roda **no banco** por um **trigger** (`schema.sql`).

Trocar de backend é uma linha:
```js
createRepository({ backend: 'supabase', supabase: { url, anonKey } })
```

---

## Exportação Excel

`src/excel/xlsx.js` gera um `.xlsx` válido (ZIP + OOXML) **sem bibliotecas** — validado
abrindo com `openpyxl`. As abas saem no layout do template (Rastreabilidade, Shadow,
Base de dados, Dicionário) com **valores calculados** ("assados"). O nome segue o padrão
`{empresa}_{cnpj}_Output_{ddMMyyyy}_ALLOCATOR_{ano}.xlsx`.

> Fidelidade: como as fórmulas de array dinâmico do template (`FILTER/TEXTJOIN`, `LET/REDUCE`)
> são frágeis fora do Excel, o export usa valores calculados (números corretos). Se você
> precisar do arquivo com **fórmulas vivas idêntico ao template**, o gerador Python original
> (`gerar_excel_contabil.py`) continua disponível e pode ser plugado num backend.

---

## Migração para React + Supabase (máquina com internet)

O `core/` é **framework-agnóstico** (funções puras) — reaproveitável direto no React:

1. `npm create vite@latest datamaster -- --template react-ts`
2. Copie `src/core`, `src/data`, `src/db`, `src/excel` para o projeto.
3. Reescreva a camada `src/ui` em componentes React (o estado/ações já estão isolados em `app.js`).
4. Rode `src/db/schema.sql` no Supabase e use `createRepository({ backend:'supabase', supabase:{url, anonKey} })`.
5. (Opcional) troque o export por `exceljs` usando o template real como base.

---

## Como os seeds foram gerados

Os arquivos em `src/data/*.seed.js` foram extraídos dos arquivos reais
(`template_plano_de_contas.xlsx`, `Dicionário de Contas.xlsx`,
`INTERPRETAÇÃO DE SINAL DRE.xlsx`) pelos scripts em `_assets_extracted/`
(`extract.py`, `gen_seeds.py`). Rode `npm run seeds` para regerar se os arquivos mudarem.

"""Prompts das tarefas de LLM — versionados (mostrar na banca)."""

PROMPT_VERSION = "v2.1-portal"

# ---------------------------------------------------------------------------
# Extração em DUAS PASSADAS (robustez p/ documentos longos):
#   1. IDENTIFY  — localiza as páginas financeiras e os rótulos de período
#   2. EXTRACT_PAGE — extrai TODAS as linhas de UMA página por vez (imagem)
# Chamadas menores = menos truncamento/sobrecarga e captura completa.
# ---------------------------------------------------------------------------

IDENTIFY = """Você é um analista contábil sênior. Examine o documento anexo e \
identifique onde estão as demonstrações financeiras.

Responda APENAS com JSON válido:
{
  "paginas_financeiras": [2, 3, 4],
  "paginas_bp": [2],
  "paginas_dre": [3, 4],
  "visoes": [],
  "periodos": ["30/04/2025 Realizado", "31/12/2025 Realizado"],
  "unidade": "Mil",
  "moeda": "BRL",
  "isBalancete": false
}

("visoes": rótulos exatos quando houver mais de um escopo lado a lado, ex.
["Controladora", "Consolidado"] — e nesse caso os "periodos" combinam
visão + data; senão [].)

Regras:
- "paginas_financeiras": APENAS as páginas do Balanço Patrimonial, da DRE \
ou de balancete. NÃO inclua DMPL, DFC (fluxos de caixa), DVA, notas \
explicativas, relatório de auditoria, capa e comentários — mesmo com \
tabelas numéricas. Só BP e DRE são alocáveis.
- "periodos": os rótulos EXATOS das colunas de valores, na ordem em que \
aparecem — inclua data E cenário quando houver (ex.: "30/04/2026 Orçado"). \
Quando houver MAIS DE UMA VISÃO (Controladora/Consolidado lado a lado), \
COMBINE visão + data (ex.: "Consolidado 31/03/2026"). Se forem só anos, \
use os anos.
- "unidade": Unitário | Mil | MM | BI conforme indicado no documento.
- "isBalancete": true somente para balancete bruto (códigos hierárquicos + \
saldos débito/crédito)."""

IDENTIFY_TEXT = """Você é um analista contábil sênior. Abaixo está o TEXTO \
extraído de cada página de um documento (trechos iniciais). Identifique onde \
estão o Balanço Patrimonial (BP) e a Demonstração do Resultado (DRE).

Responda APENAS com JSON válido, exatamente neste formato:
{{
  "paginas_financeiras": [6, 7],
  "paginas_bp": [6],
  "paginas_dre": [7],
  "visoes": ["Controladora", "Consolidado"],
  "periodos": ["Controladora 31/03/2026", "Consolidado 31/03/2026", "Consolidado 31/12/2025"],
  "unidade": "Mil",
  "moeda": "BRL",
  "isBalancete": false
}}

Regras:
- "paginas_financeiras": APENAS as páginas do Balanço Patrimonial, da DRE \
ou de balancete. NÃO inclua: DMPL (mutações do patrimônio líquido), DFC \
(fluxos de caixa), DVA (valor adicionado), notas explicativas, relatório \
de auditoria, capa, sumário e comentários — mesmo que tenham tabelas com \
números. Só BP e DRE são alocáveis.
- "visoes": os rótulos EXATOS das visões/escopos quando o documento \
apresentar mais de um lado a lado (ex.: ["Controladora", "Consolidado"], \
["Individual", "Consolidado"], ["Combinado"]). Use os termos verbatim do \
documento; se houver UMA visão só (ou nenhuma), devolva [].
- "periodos": rótulos EXATOS das colunas de valores, na ordem em que \
aparecem. Quando houver MAIS DE UMA VISÃO, COMBINE visão + data em cada \
rótulo (ex.: "Controladora 31/03/2026", "Consolidado 31/03/2026"). Inclua \
o cenário quando houver (ex.: "30/04/2026 Orçado"). Liste TODAS as colunas \
de TODAS as demonstrações (BP e DRE podem ter datas comparativas diferentes).
- "unidade": Unitário | Mil | MM | BI conforme o documento declarar \
(ex.: "Em milhares de reais" = Mil).

TEXTO POR PÁGINA:
{digest}"""

EXTRACT_PAGE_TEXT = """Você é um analista contábil sênior. Abaixo está o \
TEXTO EXATO extraído da página {pagina} de uma demonstração financeira \
(preserve os números EXATAMENTE como estão — não recalcule, não arredonde).

Extraia TODAS as linhas financeiras — cada conta E cada subconta/abertura, \
até a última linha. NUNCA resuma, NUNCA omita. Ignore apenas títulos de \
seção sem valor, índices (liquidez/solvência), rodapés e assinaturas.

Regras:
1. HIERARQUIA: se uma conta é abertura de uma conta-pai (indentação/código \
hierárquico/agrupamento), preencha "hierarquia" com o nome EXATO do pai \
imediato.
2. VALORES: números no formato brasileiro (1.234.567,89 -> 1234567.89); \
parênteses = NEGATIVO, ex. (55.497) -> -55497. Um hífen "-" isolado na \
coluna = sem valor (OMITA a chave, não é zero). Use EXATAMENTE estes \
rótulos de período como chaves de "valores": {periodos} — cada valor na \
chave da SUA coluna (atenção quando houver visões lado a lado: os valores \
da seção/colunas "Controladora" vão nas chaves "Controladora ...", os da \
"Consolidado" nas chaves "Consolidado ..."). Quando a página tiver menos \
colunas que os rótulos, use apenas as chaves das colunas presentes.
3. COLUNA "Nota": muitas demonstrações têm uma coluna de número da nota \
explicativa (ex.: 5, 12, 23.c) entre o nome da conta e os valores — ela \
NÃO é valor: ignore-a completamente.
3b. ALINHAMENTO POSICIONAL: em cada linha, os valores seguem a ORDEM das \
colunas do cabeçalho. Um "-" OCUPA a posição da sua coluna — conte as \
posições para NÃO deslocar os valores seguintes. Ex.: colunas [A, B, C, D] \
e linha "Conta X - 231 12.743 38.280" -> A=omitida, B=231, C=12743, D=38280.
4. GRUPO: "Ativo" | "Passivo" | "DRE" quando claro (seção ou 1º dígito do \
código: 1=Ativo, 2=Passivo/PL, 3=Despesa->DRE, 4=Receita->DRE); senão "". \
Contas de patrimônio líquido: grupo "Passivo", subCategoria "PL".
5. SUB CATEGORIA: "Circulante" | "Não Circulante" | "PL" | "DRE" quando \
inferível; senão "".

6. TOTAIS: linhas que são SOMA calculada de outras linhas ("Total \
circulante", "Total do ativo", "Lucro Bruto", "Resultado financeiro", \
"Lucro operacional...", "Total do patrimônio líquido", subtotais em geral) \
devem vir com "isTotal": true — elas são capturadas como referência, mas \
NUNCA são alocáveis (alocá-las dobraria os valores). Contas normais: false.

Responda APENAS com JSON válido:
{{"rows": [{{"origem": "...", "hierarquia": "", "codigo": "", \
"grupo": "", "subCategoria": "", "isTotal": false, \
"valores": {{"2025": 123.45}}}}]}}

TEXTO DA PÁGINA {pagina}:
{texto}"""

EXTRACT_PAGE = """Você é um analista contábil sênior. A imagem anexa é a \
página {pagina} de uma demonstração financeira.

Extraia TODAS as linhas financeiras desta página — cada conta E cada \
subconta/abertura, até a última linha. NUNCA resuma, NUNCA omita linhas. \
Ignore apenas títulos de seção sem valor, rodapés e assinaturas.

Regras:
1. HIERARQUIA: se uma conta é abertura de uma conta-pai (indentação, código \
hierárquico ou agrupamento visual), preencha "hierarquia" com o nome EXATO \
do pai imediato.
2. VALORES: preserve o sinal; parênteses = negativo; "-" isolado = sem \
valor (omita a chave); sem separador de milhar; ponto como decimal. Ignore \
a coluna "Nota" (número da nota explicativa) quando existir. Use EXATAMENTE \
estes rótulos de período como chaves de "valores": {periodos} — com visões \
lado a lado (Controladora/Consolidado), cada valor vai na chave da SUA \
coluna. Se a página não tiver a coluna de algum período, omita a chave.
3. GRUPO: "Ativo" | "Passivo" | "DRE" quando claro (seção ou 1º dígito do \
código: 1=Ativo, 2=Passivo/PL, 3=Despesa->DRE, 4=Receita->DRE); senão "".
4. SUB CATEGORIA: "Circulante" | "Não Circulante" | "PL" | "DRE" quando \
inferível; senão "".

5. TOTAIS: linhas que são SOMA calculada ("Total ...", "Lucro Bruto", \
subtotais) devem vir com "isTotal": true — capturadas como referência, \
nunca alocáveis.

Responda APENAS com JSON válido:
{{"rows": [{{"origem": "...", "hierarquia": "", "codigo": "", \
"grupo": "", "subCategoria": "", "isTotal": false, \
"valores": {{"31/12/2025 Realizado": 123.0}}}}]}}"""

EXTRACT = """Você é um analista contábil sênior especializado em leitura de \
demonstrações financeiras brasileiras (BP, DRE e balancetes).

Analise o documento anexo e extraia TODAS as linhas financeiras (contas E \
subcontas/aberturas) do Balanço Patrimonial e da DRE. Regras obrigatórias:

1. CAPTURA COMPLETA: nunca omita contas ou subcontas; ignore apenas títulos \
de seção, totais gerais decorativos e linhas de assinatura/cabeçalho.
2. HIERARQUIA: quando uma conta é abertura de uma conta-pai (indentação, \
código hierárquico como 1.1.2, ou agrupamento visual), preencha "hierarquia" \
com o nome EXATO do pai imediato como aparece no documento.
3. VALORES: preserve o sinal como impresso; números entre parênteses são \
negativos; remova separadores de milhar; use ponto como decimal.
4. ANOS: identifique os exercícios das colunas (ex.: 2023, 2024). Se as \
colunas forem "Saldo Anterior/Saldo Atual" de balancete, trate como dois \
períodos e use os anos se identificáveis.
5. GRUPO: classifique cada linha em "Ativo", "Passivo" ou "DRE" quando o \
documento deixar claro (pela seção ou pelo 1º dígito do código: 1=Ativo, \
2=Passivo/PL, 3=Despesa->DRE, 4=Receita->DRE). Se incerto, deixe "".
6. SUB CATEGORIA: "Circulante" | "Não Circulante" | "PL" | "DRE" quando \
inferível; senão "".
7. PÁGINA: número da página onde a linha aparece.
8. UNIDADE/MOEDA: identifique se os valores estão em unidades, Mil, MM ou BI \
e a moeda (BRL/USD/EUR).
9. BALANCETE: isBalancete=true se a fonte é balancete bruto (códigos \
hierárquicos + colunas débito/crédito/saldo).

Responda APENAS com JSON válido neste formato:
{
  "meta": {
    "anos": ["2023", "2024"],
    "unidade": "Mil",
    "moeda": "BRL",
    "isBalancete": false,
    "paginas_bp": [1, 2],
    "paginas_dre": [3]
  },
  "rows": [
    {
      "origem": "Caixa e equivalentes de caixa",
      "hierarquia": "",
      "codigo": "",
      "pagina": 1,
      "grupo": "Ativo",
      "subCategoria": "Circulante",
      "valores": {"2023": 1500.0, "2024": 1800.0}
    }
  ]
}"""

JULGAMENTAL = """Você é um analista contábil sênior fazendo o mapeamento \
JULGAMENTAL de contas de um balanço para um plano de contas padronizado \
(as camadas automáticas — memória anterior e dicionário — não encontraram \
correspondência para estas contas).

REGRAS ABSOLUTAS:
1. ATIVO só pode ir para destino de ATIVO; PASSIVO só para PASSIVO; DRE só \
para DRE. Circulante só para Circulante; Não Circulante só para Não \
Circulante; PL só para linhas de PL.
2. A hierarquia do documento prevalece sobre o nome: o destino de uma \
abertura segue a classificação da conta-pai ("hierarquia"), não a semântica \
do nome isolado.
3. Em balancetes, o 1º dígito do código manda: 1=Ativo, 2=Passivo/PL, \
3=Despesa (DRE), 4=Receita (DRE) — prevalece sobre o nome.
4. Use APENAS destinos da lista fornecida, copiando o texto EXATAMENTE como \
está — INCLUSIVE o prefixo de sinal quando houver (ex.: "-  Despesas \
Financeiras", "+ Receitas Financeiras", "+/- Variações Cambiais", "-Impostos"). \
Prefira a conta mais analítica compatível; use "Outros ..." apenas se nada \
específico couber. Se nenhum destino for estruturalmente seguro, devolva \
destino "" (a conta fica para revisão humana).
5. Para cada sugestão, dê uma justificativa de UMA frase.

CONTAS A MAPEAR (JSON):
{rows}

PLANO DE CONTAS DISPONÍVEL (destino | grupo | subCategoria):
{plano}

Responda APENAS com JSON válido:
{{"suggestions": [{{"id": "...", "origem": "...", "destino": "...",
"grupo": "...", "subCategoria": "...", "justificativa": "..."}}]}}"""

PARECER = """Você é um analista de crédito sênior. Redija um parecer \
executivo CURTO (5 a 8 frases, português profissional) sobre o planilhamento \
de balanço abaixo, cobrindo: qualidade da captura (nº de contas, períodos), \
composição do mapeamento (memória/dicionário/julgamental), fechamento do \
balanço (Ativo = Passivo + PL) e pontos de atenção do QA que o analista deve \
revisar. Não invente números além dos fornecidos. Não use markdown.

DADOS DO PLANILHAMENTO (JSON):
{resumo}"""

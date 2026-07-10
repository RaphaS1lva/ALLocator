# Regras de leitura hierárquica e coluna `Alocação da Hierarquia`

Este arquivo complementa o `SystemPrompt.md` e o `Guia_Operacional_OCR.md` com as regras de como o modelo deve tratar documentos longos com aberturas hierárquicas (sub-itens sob uma conta-pai), a coluna `Hierarquia` da `Rastreabilidade` e a coluna `Alocação da Hierarquia` (Sim/Não).

---

## 1. Quando aplicar leitura hierárquica

Aplicar **sempre** que o documento apresentar uma estrutura pai-filho, identificada por qualquer um dos sinais abaixo:

- **Indentação visual** em planilhas Excel/xls/xlsm (`alignment.indent` > 0; o filho aparece visualmente recuado em relação ao pai)
- **Códigos numerados hierárquicos** (ex.: `1`, `1.1`, `1.1.1`, `1.1.1.01`, `1.1.1.01.0001`) onde o nível de profundidade é dado pela quantidade de pontos
- **Agrupamento visual** em PDF/imagem (sub-itens listados imediatamente abaixo de um totalizador, frequentemente em fonte menor, sem negrito, ou tabulados à direita)
- **Totais em negrito ou linha separada** em PDFs auditados (ex.: linha "Caixa e Equivalentes 1.500" seguida de "Itaú 600", "Bradesco 900")
- **Texto explícito de pai-filho** (ex.: "do qual:", "incluindo:", "composto por:")

Para documentos curtos sem aberturas (tipicamente DRE e BP de demonstrações auditadas simples), tratar cada linha como top-level e deixar `Hierarquia` vazia.

---

## 2. Decisão julgamental: abrir ou totalizar

Para cada conta-pai detectada, decidir caso a caso entre:

### A. Abrir as aberturas (uma linha por sub-item, com Hierarquia preenchida)

Use quando os sub-itens têm **valor analítico independente** e poucos em número, por exemplo:
- `Caixa e Equivalentes` desdobrado por instituição financeira (Itaú, Bradesco, Santander…)
- `Estoques` desdobrado por categoria (produtos acabados, matéria-prima, em elaboração)
- `Empréstimos` desdobrado por moeda, prazo ou contraparte estratégica
- `Imobilizado` desdobrado por classe (terrenos, edifícios, máquinas)
- `Aplicações Financeiras` desdobradas por tipo de instrumento

### B. Manter apenas o totalizador (uma linha única, sem aberturas)

Use quando os sub-itens são **lista atomizada de baixo valor analítico**:
- `Fornecedores` com dezenas/centenas de nomes individuais
- `Clientes` por CNPJ individual
- `Salários a Pagar` por funcionário
- Tributos detalhados por nota fiscal
- Contas correntes por número (quando muito numerosas)

### Princípio operacional

Não há lista pré-definida. A decisão é **100% julgamental** — pondere:
- Quantidade de sub-itens (poucos = facilita análise; muitos = ruído)
- Materialidade individual de cada sub-item
- Se o sub-item representa contraparte/instrumento/categoria distinta com semântica própria
- Se o analista de crédito teria interesse em ver o detalhe para entender o risco/posicionamento

### Coluna "Alocação da Hierarquia" (Sim / Não)

A `Rastreabilidade` tem a coluna **`Alocação da Hierarquia`** (Sim/Não) — coluna **`D`** do template. Para cada agrupamento hierárquico, decida **com julgamento contábil** qual nível é o **escolhido para alocação no template** e marque:

- **Sim** = nível escolhido para alocação (pode ser o **totalizador** OU as **aberturas**, conforme o julgamento). Só as linhas **Sim** geram `Chave`/`Chave Destino` e **contam** no template.
- **Não** = linha capturada apenas como **contexto/referência/detalhe auxiliar**, sem alocação direta. O `Destino no Template` **é igualmente preenchido** (sugestão para edição manual), mas a linha **não conta** (`Chave` fica vazia).

**Regra final**: somente linhas com `Alocação da Hierarquia = Sim` **contam** (geram chave e entram nos SUMIFS); linhas `Não` ficam como contexto/sugestão para revisão humana (com `Destino` preenchido, mas chave vazia). A `Alocação` é **autoritativa** (julgamento do modelo) — **não** é derivada da existência de destino. **Nunca** marcar simultaneamente o totalizador **E** suas aberturas como `Sim` (anti-dupla-contagem, ver §5).

> ### CAPTURA COMPLETA (obrigatório)
> Traga **todas** as linhas financeiras das páginas selecionadas — a conta-pai **e** suas subcontas/aberturas. O julgamento "qual nível recebe `Sim`" decide apenas **o que é alocado** (recebe `Destino no Template`), **nunca** o que é capturado. As subcontas que não forem o nível alocado entram na `Rastreabilidade` com `Alocação da Hierarquia = Não` (com `Destino no Template` apenas como sugestão, sem contar), **jamais omitidas**. Assim o analista vê tudo e pode manter a alocação automática **ou realocar manualmente**. Só ficam de fora totais gerais, subtotais e linhas puramente decorativas/de soma — **nunca** contas reais.

Critérios de julgamento (qual nível recebe `Sim` = é alocado; as **demais linhas continuam capturadas** com `Não`):
- **Evitar totalizador quando há abertura analítica relevante**: poucas aberturas com significado próprio → aberturas `Sim`, totalizador `Não`.
- **Evitar granularidade sem valor na ALOCAÇÃO**: muitas aberturas atomizadas (fornecedores, clientes, funcionários, NFs, contas bancárias individuais pouco materiais) → totalizador `Sim`; as aberturas **continuam sendo capturadas**, todas com `Não`.
- **Buscar o nível mais útil** para o analista; materialidade e relevância prevalecem sobre a forma; diretriz prática de **até ~4 origens alocadas (`Sim`) por hierarquia** (lembrete do analista) — **não** limita a captura de subcontas `Não`.
- **Não alocar contas zeradas**: conta com valor **zero (ou vazio) em todos os anos** **não** deve ser alocada (`Sim`) — alocar zero vira ruído e **polui a Memoria Anterior futura**; capture-a como contexto (`Não`). O parecer sinaliza linhas `Sim` zeradas (`validate_year_value_coverage`, contador `sim_alocadas_zeradas`).

> A `Alocação da Hierarquia` é **autoritativa**: vem do julgamento do modelo, **não** é derivada do destino (que agora é preenchido em **todas** as linhas). Quando o modelo não a informa, o script assume **`Não`** (conservador). O parecer sinaliza incoerências e dupla contagem.

### Guideline de quantidade de origens por hierarquia (lembrete do analista)

**Lembrete obrigatório ao ler o arquivo** (passo *default*, sem esperar o usuário pedir): para cada **hierarquia relevante**, decidir o nível de alocação aplicando a diretriz de **até ~4 origens contábeis alocadas (`Sim`) por hierarquia** (≈ por `Destino no Template`). Esse lembrete do analista melhora muito a consolidação. É uma **diretriz prática**, não obrigação: se a natureza do documento exigir mais ou menos granularidade, prevalece o julgamento contábil — materialidade, relevância, risco analítico e utilidade para a análise de crédito prevalecem sobre a forma. **Atenção**: esse limite vale só para linhas **alocadas (`Sim`)**; linhas de contexto (`Não`) **não têm limite** — capture **todas** as subcontas das páginas selecionadas.

### A hierarquia do documento prevalece (nome ≠ destino)

A **estrutura/hierarquia do documento** (a conta-pai sob a qual a abertura aparece) é o critério **mais forte** para decidir o `Destino no Template` — acima da natureza semântica do nome da abertura e até de um mapeamento genérico de dicionário que a contradiga.

- Se o documento aninha uma conta sob um pai explícito (ex.: balancete com `4.2.1.2 - Despesas Gerais e Administrativas`), o destino dos **filhos segue a classificação do pai** (→ `- Despesas Administrativas`), **não** o nome do filho. Ex.: `DELIVERY`, `LOGÍSTICA`, `MARKETING E PUBLICIDADE`, `CRM/TRADE` listados sob *Despesas Gerais e Administrativas* vão para `- Despesas Administrativas`, mesmo que "delivery"/"marketing" sugiram, pela natureza, despesa de **vendas**.
- **Sinal de alerta (irmãos divergentes)**: se aberturas com a **mesma conta-pai** terminam em destinos diferentes (parte em `- Despesas com Vendas`, parte em `- Despesas Administrativas`), revise — quase sempre é classificação pela natureza do nome ignorando a hierarquia. O script sinaliza isso no parecer (`validate_sibling_consistency`), **desde que a coluna `Hierarquia` esteja preenchida**.

### Quando preferir o totalizador (anti-ambiguidade)

Quando há **vários filhos sob o mesmo pai** e a classificação individual é **ambígua** (ou dispersaria os filhos em destinos diferentes), **prefira alocar o totalizador do pai** — que costuma casar de forma limpa no dicionário (ex.: `Despesas Gerais e Administrativas → - Despesas Administrativas`) — marcando-o `Alocação da Hierarquia = Sim` e as aberturas `Não` (ver §5, Opção 1). Evita erro de classificação por filho e dupla contagem.

### Validação ANTES de entregar (não esperar o usuário pedir)

A decisão de nível (totalizador × aberturas) é **obrigatória antes de gerar o arquivo** — não deixar para corrigir só depois que o usuário reclamar (foi uma dor real de teste: a alocação ficou analítica demais, com filhos atomizados alocados e o pai como contexto). Revisar **cada** bloco pai-filho e aplicar:

- **Filhos atomizados → promover o totalizador.** Se um totalizador está `Não` e tem **muitas** aberturas atomizadas (acima de ~**4 por hierarquia**: fornecedores, clientes, tributos, contas correntes, salários por funcionário, NFs…) **todas alocadas (`Sim`) para o MESMO destino**, **marque o totalizador como `Sim`** e rebaixe as aberturas a contexto (`Não`, com os valores preservados). O parecer do script sinaliza isso automaticamente (`validate_totalizer_promotion`, limiar editável `TOTALIZADOR_PROMOCAO_MIN_FILHOS`).
- **Destinos divergentes → NÃO promover.** Se as aberturas iriam para destinos diferentes, **não** promova o pai (ele misturaria classificações); mantenha as aberturas e revise a classificação pela hierarquia (`validate_sibling_consistency`).
- **Nunca os dois níveis `Sim`.** Pai **e** aberturas com `Sim` é dupla contagem (`validate_alocacao_consistency`).
- **CAPTURA COMPLETA dos valores.** Toda linha capturada — **inclusive as de contexto (`Não`)** — mantém o valor do ano em `Ano 1/2/3` (não somam na Shadow, mas o valor permanece para revisão/realocação manual). O parecer traz a matriz `cobertura_valores` (`Alocação Sim/Não × com/sem valor`) e o total `contas_capturadas`; garantir que **nenhuma linha `Sim` fique sem valor (nem zerada)** — conta zerada **não** se aloca (vai como `Não`, evita ruído na Memoria Anterior futura) (`validate_year_value_coverage`; contador `sim_alocadas_zeradas`).

Tratar os avisos do parecer como **itens de correção pré-entrega**, não como observações opcionais: se houver sinalização, refazer a decisão de nível e só então entregar.

---

## 3. Coluna `Hierarquia` na `Rastreabilidade`

A coluna `B` da `Rastreabilidade` chamada `Hierarquia` recebe o **nome da conta-pai imediata do documento** para cada linha.

> **Obrigatório para aberturas.** Sempre preencher `Hierarquia` quando a linha é abertura de um pai — é o que permite ao analista e ao guardrail automático (`validate_sibling_consistency`) detectar filhos do mesmo pai alocados a destinos diferentes. Sem `Hierarquia`, esse guardrail não atua.

### Conteúdo

- **Totalizador / pai principal** (conta que tem aberturas capturadas abaixo dela): no arquivo final a coluna `Hierarquia` exibe o **nome da própria conta** (sem sufixo) — **o script aplica isso automaticamente** a toda linha detectada como totalizador, **inclusive a um totalizador que também é abertura de um pai de nível superior** (multi-nível). Ex.: `1.1.1.03 - APLICAÇÕES FINANCEIRAS LIQ IMEDIATA` (abertura de `1.1.1 - DISPONÍVEL`, mas pai de outras aberturas) sai com `Hierarquia = "1.1.1.03 - APLICAÇÕES..."`, **não** `"1.1.1 - DISPONÍVEL"`. **Ao preencher**, o modelo informa sempre o **pai imediato** nas aberturas — **mesmo quando a abertura é, ela própria, um totalizador** — pois é isso que permite detectar o totalizador em **cada** nível; o nome próprio é aplicado pelo script. O flag vai na coluna **`Totalizador` (C, Sim/Não)**, **derivada pelo script**; o modelo **não** preenche essa coluna.
- **Sub-itens (aberturas)**: nome do **pai imediato**, **sem** sufixo. Ex.: `ABC Ltda` e `XYZ SA` com `Hierarquia = "Fornecedores"`; `Banco Itaú` com `Hierarquia = "Caixa e Equivalentes"`
- **Linhas top-level SEM aberturas** (conta isolada, sem filhos): `Hierarquia` = **nome da própria conta** (nunca vazia, **sem** sufixo). Ex.: `Caixa` (sem desdobramento) com `Hierarquia = "Caixa"`
- **Linhas de contexto** (`Alocação da Hierarquia = Não`, ver §4): `Hierarquia` sempre preenchida com o nome do pai do qual a linha foi extraída

### Regras

1. Usar **nome exato do pai como aparece no documento**, sem normalização ou tradução
2. Quando houver mais de um nível de hierarquia (ex.: `Ativo Circulante > Caixa e Equivalentes > Itaú`), gravar apenas o **pai imediato** (`Caixa e Equivalentes`), nunca o caminho completo
3. Não usar `Hierarquia` para indicar `Destino no Template` — o destino tem coluna própria (`K`)
4. **Convenção de top-level**: contas de primeiro nível (sem conta-mãe identificável) recebem `Hierarquia` = **nome da própria conta** (a `Origem`). O script preenche isso automaticamente quando a `Hierarquia` vier vazia.

### Como o totalizador é identificado (e leitura multipágina)

Uma linha é tratada como **totalizador (pai principal)** quando sua `Origem` aparece como `Hierarquia` (conta-pai) de **pelo menos uma abertura** capturada. O script deriva isso dos dados e marca a coluna `Totalizador` (C) = `Sim`. Portanto, o que garante a marcação correta é **preencher a `Hierarquia` das aberturas com o nome EXATO do pai**.

Em **multi-nível**, uma conta pode ser, ao mesmo tempo, **abertura** de um pai e **totalizador** das próprias aberturas: ela é marcada `Totalizador = Sim` e a coluna `Hierarquia` passa a exibir o **nome dela mesma** (o script sobrescreve o nome do pai **apenas na exibição**; a detecção e os guardrails continuam usando o **pai imediato** informado nas aberturas).

**Documentos multipágina (atenção redobrada):**
1. O pai principal aparece geralmente **uma vez** (cabeçalho do grupo ou linha "Total de …"); suas aberturas podem **continuar nas páginas seguintes**. Ligue pai ↔ aberturas pela **estrutura** (indentação, numeração da conta, subtotais, ordem do balancete), **nunca** pela página.
2. Use **exatamente o mesmo nome de pai** em todas as aberturas do grupo, mesmo em páginas diferentes — qualquer variação (abreviação, maiúsculas, espaço extra) quebra o vínculo e o totalizador deixa de ser reconhecido.
3. Capture **pai e filhos** ainda que estejam em páginas distintas; não reinicie a hierarquia a cada página.
4. `Página Referência` registra a página onde **aquela** linha aparece — o vínculo de hierarquia é **estrutural**, independente da página.

---

## 4. Linhas de contexto (`Alocação da Hierarquia = Não`)

> **`Referência` foi descontinuado.** A versão antiga usava `Tipo de Mapeamento = Referência` para marcar contexto. Agora isso é a coluna **`Alocação da Hierarquia = Não`** (coluna `D`). O `Tipo de Mapeamento` tem só três valores — `Memoria Anterior`, `Dicionário`, `Julgamental` — e o script o deixa **vazio nas linhas `Não`**.

### Definição

Linha extraída do OCR e gravada na `Rastreabilidade` **apenas para revisão do analista**, sem alocação ativa. Recebe `Alocação da Hierarquia = Não`; o `Destino no Template` **é preenchido como sugestão**, mas a linha não participa das somas (a `Chave`/`Chave Destino` fica **vazia** — `=IF($D="Sim";…;"")` — e o SUMIFS não soma).

### Quando marcar `Não` (contexto)

**Toda** subconta/abertura que não é o nível escolhido para alocação recebe `Não` — e **deve ser capturada**, nunca omitida. Casos típicos:

1. **Anti-dupla-contagem**: o totalizador da conta-pai foi escolhido para alocação (`Sim`, com destino) e você traz **todas** as aberturas para o analista revisar → aberturas com `Não`.
2. **Dúvida de alocação**: a abertura pertence à conta-pai já alocada e não há clareza se merece destino próprio.
3. **Contexto adicional**: a abertura traz informação relevante (composição geográfica, vencimentos), mesmo sem destino estrutural.

### Quando é `Sim` (e não `Não`)

- Quando o totalizador **não** será alocado e as aberturas devem ir a destinos próprios → aberturas `Sim` + `Destino no Template`.
- Quando a abertura pertence a um destino diferente do pai → `Sim` + destino correto.

### Layout de uma linha de contexto (`Não`)

| Coluna | Conteúdo |
|---|---|
| A — Origem | nome da abertura no documento |
| B — Hierarquia | nome da conta-pai imediata |
| C — Página Referência | página(s) da abertura |
| D/E/F — Ano 1/2/3 | valor por período |
| G — Grupo | Ativo / Passivo / DRE |
| H — Sub Categoria | Circulante / Não Circulante / DRE / PL |
| I — Destino no Template | **vazio** |
| J — Tipo de Mapeamento | **vazio** (sem alocação) |
| K — Chave | (fórmula `=A&"|"&G&"|"&H`) |
| L — Chave Destino | (fórmula `=I&"|"&G&"|"&H` — fica `"|G|H"` com destino vazio, o que faz SUMIFS não somar) |
| M — Alocação da Hierarquia | **`Não`** |

---

## 5. Regra anti-double-counting

Esta é a regra mais importante e o motivo de existir a coluna `Alocação da Hierarquia`.

**Nunca alocar simultaneamente, em destinos válidos, o totalizador de uma conta-pai E suas aberturas filhas.** Sempre escolher uma das duas opções:

### Opção 1: alocar o totalizador
- Uma linha para o pai: `Origem = pai`, `Destino no Template = X`, `Tipo = Memoria Anterior/Dicionário/Julgamental`, `Alocação da Hierarquia = Sim`
- Aberturas: **sempre aparecem** com `Alocação da Hierarquia = Não` (com `Destino` apenas como sugestão, para revisão) — **nunca omitir** subcontas

### Opção 2: alocar as aberturas
- Uma linha por filho: `Origem = filho_i`, `Hierarquia = pai`, `Destino no Template = X_i`, `Tipo = Memoria Anterior/Dicionário/Julgamental`, `Alocação da Hierarquia = Sim`
- O totalizador recebe `Alocação da Hierarquia = Não` (com `Destino` apenas como sugestão) OU não entra na `Rastreabilidade`

### Validação numérica

Quando aberturas forem alocadas (Opção 2):
- A soma dos valores das aberturas em cada `Ano N` deve **bater** com o totalizador lido no documento (todas as aberturas são capturadas)
- Se houver discrepância > 1% (tolerância de arredondamento OCR), reportar no parecer final como aviso de revisão

Quando o totalizador for alocado (Opção 1):
- As aberturas de contexto (`Não`) não devem somar a um valor diferente do totalizador alocado (mesmo princípio)

---

## 6. Exemplos práticos

### Exemplo A — Balancete Excel com códigos `1.1.1.x` (arquivo longo)

OCR lê:
```
1.1.1.01  Caixa Geral                  1.500
1.1.1.01.0001  Caixa Sede SP            900
1.1.1.01.0002  Caixa Filial RJ          600
```

Decisão: poucos sub-itens, valor analítico relevante → **Opção 2** (alocar aberturas).

`Rastreabilidade`:
| Origem | Hierarquia | Totalizador | Destino | Tipo | Alocação |
|---|---|---|---|---|---|
| Caixa Sede SP | Caixa Geral | Não | Disponibilidades | Julgamental | Sim |
| Caixa Filial RJ | Caixa Geral | Não | Disponibilidades | Julgamental | Sim |
| Caixa Geral | Caixa Geral | Sim | Disponibilidades | (vazio) | Não |

O totalizador `Caixa Geral 1.500` é capturado como contexto (`Não`) com o `Destino` apenas como sugestão; é marcado na coluna `Totalizador` (C) = `Sim` (derivado pelo script, pois é pai das aberturas) e a `Hierarquia` mostra só `Caixa Geral` (sem sufixo). Soma das aberturas alocadas: 900 + 600 = 1.500. ✓

### Exemplo B — BP auditado com Fornecedores detalhados

OCR lê:
```
Fornecedores                            3.200
  ABC Insumos Ltda                       400
  XYZ Distribuidora SA                   350
  ... (47 outros nomes individuais)    2.450
```

Decisão: muitos sub-itens (lista atomizada de baixo valor analítico) → **Opção 1** para a ALOCAÇÃO (só o totalizador recebe destino). Mas **todas as aberturas continuam sendo capturadas** com `Não`.

`Rastreabilidade`:
| Origem | Hierarquia | Totalizador | Destino | Tipo | Alocação |
|---|---|---|---|---|---|
| Fornecedores | Fornecedores | Sim | Fornecedores | Memoria Anterior | Sim |
| ABC Insumos Ltda | Fornecedores | Não | Fornecedores | (vazio) | Não |
| XYZ Distribuidora SA | Fornecedores | Não | Fornecedores | (vazio) | Não |
| … (cada um dos 47 demais nomes, uma linha) | Fornecedores | Não | Fornecedores | (vazio) | Não |

(Traga **todas** as aberturas que o documento apresenta com `Alocação da Hierarquia = Não`; só o totalizador recebe `Sim`. **Nenhuma** linha financeira é descartada — o analista decide o que manter ou realocar manualmente.)

### Exemplo C — DRE simples sem hierarquia (PDF auditado curto)

OCR lê:
```
Receita Bruta              10.000
Impostos                   (2.000)
Receita Líquida             8.000
CMV                        (4.000)
Lucro Bruto                 4.000
```

Decisão: nenhuma hierarquia → todas as linhas top-level, `Hierarquia` = nome da própria conta, `Alocação da Hierarquia = Sim`.

---

## 7. Checklist de validação ao final da alocação

Antes de gerar o arquivo final, validar:

- [ ] Para cada `Hierarquia` preenchida, existe pelo menos uma linha de contexto (a abertura ou o totalizador) no documento original
- [ ] Nenhuma linha tem `Alocação da Hierarquia = Não` com `Destino no Template` preenchido (são mutuamente exclusivos)
- [ ] Toda linha com `Destino no Template` preenchido tem `Alocação da Hierarquia = Sim`
- [ ] Para cada totalizador alocado, a soma das aberturas de contexto (`Não`) não excede o valor do totalizador (tolerância 1%)
- [ ] Para cada conjunto de aberturas alocadas, a soma bate com o totalizador lido no documento (tolerância 1%)
- [ ] Hierarquia usa o nome **exato** do pai como no documento, sem normalização
- [ ] Quando a fonte é balancete (ver §8), saldos de contas de grupos credores (Passivo/PL/DRE) foram **invertidos** antes da gravação

---

## 8. Sinal contábil ao ler BALANCETE

A regra §14.1 do `Guia_Operacional_OCR.md` (prefixo do destino) cobre **OCR de BP/DRE já estruturado**, onde o sinal lido representa a apresentação final. Quando a fonte é um **balancete bruto** (saldo contábil débito/crédito), é preciso aplicar **uma conversão prévia** de sinal contábil → sinal de apresentação, ANTES de aplicar a regra de prefixo do destino.

### 8.1. Como identificar que a fonte é um balancete

Sinais de que o arquivo é balancete (e não BP/DRE estruturado):

- Códigos hierárquicos numerados (`1.1.1.01.0001`, etc.)
- Colunas tipo "Saldo Anterior / Débito / Crédito / Saldo Atual"
- Origens com prefixo `(-)`, `(−)` ou `( - )` no nome (ex.: `(-) PREJUÍZOS ACUMULADOS`, `(-) TRIBUTOS DIFERIDOS`)
- Saldos de contas de Passivo, PL e Receitas aparecem com **sinal negativo** (convenção contábil de saldo credor)
- Saldos de contas de Despesas aparecem com **sinal positivo** (saldo devedor)
- Título do arquivo contém "Balancete", "Razão", "Razonete" ou similar
- Número de linhas elevado (tipicamente 100+) com muitas aberturas analíticas

### 8.2. Regra de conversão de sinal

Para cada linha lida do balancete, calcular o **valor de apresentação** antes de aplicar §14.1:

```
apresentacao = saldo_balancete × sinal_grupo

onde sinal_grupo = +1 se grupo do DESTINO é devedor (Ativo, Despesa)
                 = -1 se grupo do DESTINO é credor (Passivo, PL, Receita)
```

Em palavras:

- **Ativo / Despesas (devedor):** preservar o saldo do balancete (sinal_grupo = +1)
- **Passivo / PL / Receitas (credor):** inverter o saldo do balancete (sinal_grupo = -1)

### 8.3. Não usar o `(-)` do nome da origem como modificador de sinal

O prefixo `(-)` no NOME da origem (ex.: `(-) PREJUÍZOS ACUMULADOS`) é apenas rótulo descritivo do plano de contas; **NÃO** é um modificador de sinal adicional. Ele indica que a conta é redutora dentro do parent, mas **o saldo do balancete já reflete essa natureza** (uma redutora de PL credor aparece com saldo devedor positivo, e a regra §8.2 a converte corretamente).

Tratar `(-) PREJUÍZOS ACUMULADOS` exatamente como qualquer outra conta de PL — usar `sinal_grupo = -1` (PL é credor) e aplicar §8.2.

### 8.4. Sequência operacional (balancete → Rastreabilidade)

Para cada linha do balancete a alocar:

1. Ler `saldo_balancete` (com sinal contábil cru)
2. Identificar `Grupo` e `Sub Categoria` do destino
3. Calcular `apresentacao = saldo_balancete × sinal_grupo` (§8.2)
4. Aplicar regra de prefixo do destino (§14.1 do Guia):
   - Destino começa com `-` ou `+` (não `+/-`): gravar `|apresentacao|` (positivo)
   - Destino começa com `+/-` ou sem prefixo: gravar `apresentacao` (com sinal)
5. O valor resultante vai para `Ano N` da `Rastreabilidade`

### 8.5. Exemplos práticos (balancete real)

| Origem | Saldo bal | Grupo destino | sinal_grupo | apresentacao | Prefixo destino | Valor a gravar |
|---|---:|---|---:|---:|---|---:|
| `Capital Social` | -105.174.175 | PL (credor) | -1 | +105.174.175 | sem prefixo | **+105.174.175** |
| `(-) PREJUÍZOS ACUMULADOS` | +114.707.228 | PL (credor) | -1 | **-114.707.228** | sem prefixo | **-114.707.228** |
| `AJUSTE A VALOR JUSTO` | -937.737 | PL (credor) | -1 | +937.737 | sem prefixo | **+937.737** |
| `(-) TRIBUTOS DIFERIDOS` | +326.192 | PL (credor) | -1 | **-326.192** | sem prefixo | **-326.192** |
| `PROVISÃO P/ PERDAS EM INVESTIMENTOS` | -62.295.337 | Passivo (credor) | -1 | +62.295.337 | sem prefixo | **+62.295.337** |
| `EQUIVALÊNCIA PATRIMONIAL NEGATIVA` (despesa) | +222.715.933 | DRE (credor p/ apres.) | -1 | -222.715.933 | `+/-` | **-222.715.933** |
| `EQUIVALÊNCIA PATRIMONIAL POSITIVA` (receita) | -68.982.246 | DRE (credor p/ apres.) | -1 | +68.982.246 | `+/-` | **+68.982.246** |
| `DESPESAS COM PESSOAL` (despesa) | +47.000.000 | DRE (credor p/ apres.) | -1 | -47.000.000 | `-` | **+47.000.000** (|apres|, §14.1) |
| `RECEITA DE VENDAS` (receita) | -76.000.000 | DRE (credor p/ apres.) | -1 | +76.000.000 | sem prefixo | **+76.000.000** |
| `CAIXA E EQUIVALENTES` | +1.500 | Ativo (devedor) | +1 | +1.500 | sem prefixo | **+1.500** |

> **Convenção DRE:** Para destinos de DRE, tratamos receitas E despesas como pertencentes ao "grupo credor" para fins de §8.2 (sinal_grupo = -1). Isso é porque tanto receita (que naturalmente está como crédito no balancete) quanto despesa (que naturalmente está como débito no balancete) precisam ser invertidas para representar contribuição ao lucro (receita aumenta, despesa diminui).

### 8.6. Validação pós-alocação para balancete

Quando a fonte é balancete, validar antes de salvar:

- [ ] **Ativo = Passivo + PL** após a conversão de sinais (esta validação não passa se §8.2 não foi aplicada corretamente)
- [ ] Para cada destino de PL/Passivo sem prefixo: se o saldo do balancete tinha sinal positivo (devedor) E a origem começa com `(-)`, o valor gravado deve ser **negativo**
- [ ] Para cada destino de PL/Passivo sem prefixo: se o saldo do balancete tinha sinal negativo (credor) E a origem **não** começa com `(-)`, o valor gravado deve ser **positivo**
- [ ] Para cada destino de DRE com prefixo `+/-`: receitas (saldo credor negativo) viram positivas; despesas (saldo devedor positivo) viram negativas

Se `Ativo ≠ Passivo + PL` (diferença acima da tolerância de arredondamento, p.ex. > 1% do Ativo total), o balanço **não fechou** — é **erro de QA bloqueante**: não entregar. Aplicar o protocolo de auto-correção abaixo.

#### 8.6.1. Balanço não fecha: diagnóstico e auto-correção (fail-fast)

`Ativo = Passivo + PL` é **regra de fechamento obrigatória**. Quando não fechar, **investigar a causa, refazer a análise/alocação e revalidar** até as regras principais baterem — **nunca** entregar o arquivo com o balanço aberto. **Não há conta de destino pré-fixada** para o ajuste: o nível correto é decidido por **julgamento conforme a estrutura do documento/template** (não assumir um nome fixo como "Lucros Acumulados").

1. **Medir.** Por ano, `Diferença = Ativo − (Passivo + PL)` (somando as linhas efetivamente alocadas, já em apresentação) e o **Resultado do Exercício** da DRE (`Receitas − Custos/Despesas`, com os sinais já convertidos).
2. **Diagnosticar a causa** (verificar nesta ordem; pode haver mais de uma):
   - **Balancete não encerrado** (causa frequente): a `Diferença` ≈ **Resultado do Exercício** → o resultado do período não foi transportado ao PL. Levar o resultado para a **conta de PL que o documento/estrutura indica** (decidir por julgamento, conforme o Plano de Contas/template). **Sinal econômico**: lucro **aumenta** o PL (positivo); prejuízo **reduz** (negativo). Não aplicar `|valor|`, salvo se o destino estrutural exigir prefixo.
   - **Sinal/conversão (§8.2)**: saldo de balancete não convertido para apresentação, ou `(-)` no nome preservado em vez de invertido. → Reaplicar a conversão saldo→apresentação.
   - **Conta omitida**: conta material do BP não foi capturada/alocada. → Revisar a captura.
   - **Dupla contagem**: totalizador **e** aberturas alocados (`Sim`) ao mesmo tempo, ou conta lançada duas vezes. → Anti-dupla-contagem (§5).
   - **Grupo/Sub trocado**: conta de Ativo alocada em Passivo/PL (ou vice-versa); o 1º dígito do código manda (§8.7). → Corrigir o Grupo/Destino.
3. **Refazer** a análise/alocação corrigindo a causa identificada.
4. **Revalidar** `Ativo = Passivo + PL`. Repetir 1–4 até fechar.
5. **Entregar somente após fechar.** Se, após investigar, o balanço genuinamente não puder fechar (documento incompleto, ou o usuário pediu **explicitamente** para manter o balancete **não encerrado/cru**), **não** marcar como concluído: reportar no parecer a `Diferença`, a causa provável e as contas suspeitas, e pedir orientação.

---

### 8.7. Código contábil determina o Grupo (não o nome da origem)

Em balancetes que usam código hierárquico numerado, o **primeiro dígito do código** indica deterministicamente o grupo. Esta informação **prevalece sobre qualquer leitura semântica do nome** da conta.

| 1º dígito do código | Grupo | Sub Categoria típica |
|---|---|---|
| **1** | Ativo | Circulante / Não Circulante |
| **2** | Passivo / PL | Circulante / Não Circulante / PL |
| **3** | Despesa | DRE |
| **4** | Receita | DRE |
| **5** | Apuração de resultado | DRE (ignorar, contas de fechamento) |

**Regra forte:** se o nome de uma conta sugere uma natureza (ex.: parece "despesa") mas o código indica outra (ex.: começa com `4.`, portanto é receita), **prevalece o código**. Casos comuns de armadilha por similaridade de nome:

| Origem | Código | Natureza real | Pode parecer (errado) |
|---|---|---|---|
| `DESCONTOS FINANCEIROS OBTIDOS` | 4.x.x.x | Receita financeira | "despesa financeira" |
| `ATUALIZAÇÃO DE INDÉBITOS TRIBUTÁRIOS - TAXA SELIC` | 4.x.x.x | Receita financeira (correção de saldo a recuperar) | "despesa tributária" |
| `REVERSÃO DE PROVISÕES` | 4.x.x.x | Receita (reversão = entrada) | "provisão" |
| `SERVIÇOS PRESTADOS POR TERCEIROS` | 3.x.x.x | Despesa com terceiros | "vendas/serviços prestados" |
| `JUROS PASSIVOS` | 3.x.x.x | Despesa financeira | "passivo" (grupo 2) |
| `(-) PIS`, `(-) COFINS`, `(-) ISS` | 4.x.x.x ou 3.x.x.x conforme plano | Redutor de receita ou despesa tributária — usar o código | inferir só pelo `(-)` |

### 8.8. Sequência operacional revisada (com validação por código)

Para cada linha do balancete a alocar:

1. Ler `codigo`, `nome`, `saldo_balancete`
2. **Determinar Grupo pelo 1º dígito do código** (Tabela §8.7), não pelo nome
3. Identificar destino candidato dentro do Grupo (Shadow → Dicionário → Julgamental)
4. Validar coerência: Grupo do destino deve coincidir com Grupo do código (Ativo→Ativo, Receita→DRE, etc.)
5. Calcular `apresentacao = saldo × sinal_grupo` (§8.2, agora com sinal_grupo derivado do código)
6. Aplicar regra de prefixo do destino (§14.1 do Guia)
7. Gravar valor resultante em `Ano N`

### 8.9. Validação adicional pós-alocação por código

- [ ] Nenhuma origem com código começando em `4.` foi alocada em destino que começa com `-` ou `-Custo`/`-Despesas` (receita não vai em destino de despesa)
- [ ] Nenhuma origem com código começando em `3.` foi alocada em destino sem prefixo de DRE de receita (`Vendas Totais`, `+ Receitas...`)
- [ ] Nenhuma origem com código `1.x` em destino de Passivo/PL/DRE e vice-versa
- [ ] Se houve regra de prevalência do código sobre nome aplicada (ex.: nome parece despesa mas código é 4.x), registrar no parecer final como nota de classificação

> **Por que a violação dá erro pequeno e sutil:** quando uma receita (4.x) é alocada em destino com prefixo `-` (despesa), o template subtrai o valor positivo, virando `-X` no resultado, quando o correto seria `+X`. O delta é `2X`, mas costuma ser pequeno em valor absoluto e passa despercebido na conferência grosseira `Ativo = Passivo + PL`. Detectar requer checagem por código.

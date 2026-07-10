# Guia Operacional OCR - BP e DRE

## 1. Objetivo
Este guia define as regras operacionais para leitura de BP e DRE, alocação de contas no template Excel e atualização das abas `Rastreabilidade`, `Shadow` e `Listas`.

Prioridade:
1. instrução direta do usuário
2. System Prompt
3. este guia
4. defaults do agente

---

## 2. Arquivos obrigatórios
Uso obrigatório:
- `template_plano_de_contas.xlsx` ou `template_plano_de_contas.xlsm`
- `Dicionário de Contas.xlsx`
- `Guia_Operacional_OCR.md`

Regras:
- este guia deve ser lido antes de qualquer execução
- o template original deve ser usado como base do output
- nunca recriar o workbook do zero

Arquivos adicionais possíveis:
- balanço em PDF
- imagem
- DOCX
- arquivo Excel adicional com aba `Shadow`

---

## 3. Leitura e execução técnica
Regras de execução:
- para PDFs, usar prioritariamente a leitura nativa de PDF do ChatGPT
- para imagens, usar prioritariamente a análise nativa de imagem do ChatGPT
- para preenchimento do template, preservação de fórmulas, validações e geração do arquivo final, usar Python
- não apenas descrever o procedimento; executar sempre que o ambiente permitir
- para qualquer tarefa que exija abrir, ler, editar, preencher, validar, recalcular ou salvar Excel, usar obrigatoriamente Python
- não encerrar a execução após a primeira falha de ambiente
- se a primeira tentativa falhar, tentar novamente automaticamente ao menos 1 vez antes de concluir falha
- não orientar o usuário a pedir manualmente o interpretador de códigos
- só reportar erro quando as tentativas internas tiverem sido esgotadas
- se a leitura do documento estiver com baixa qualidade, informar isso explicitamente e reforçar as validações

Regras de workbook:
- usar sempre o arquivo do template como base do output
- preservar abas, fórmulas, estilos, validações, proteção, nomes definidos e macros quando existirem
- se o template for `.xlsm`, preservar VBA/macros
- marcar o workbook para recálculo completo ao abrir
- não apagar, recriar ou reordenar abas
- não alterar manualmente a lógica de fórmulas já existentes

---

## 4. Política de execução e retentativa
Quando a tarefa envolver Excel, o fluxo deve ser executado via Python obrigatoriamente.

Regras:
- não responder apenas com descrição do processo
- não encerrar após a primeira falha de ambiente
- tentar novamente automaticamente ao menos 1 vez antes de concluir falha
- só reportar erro ao usuário quando as tentativas internas tiverem sido esgotadas
- nunca orientar o usuário a pedir novamente o uso do interpretador de códigos

---

## 5. Fluxo obrigatório antes da alocação
Antes de alocar:
1. analisar o documento
2. identificar as **visões/modelos realmente presentes** no documento, lendo os rótulos efetivos (nunca assumir nomes padrão como `Individual`/`Consolidado`); ver §5.1 para a distinção entre visão e período
3. identificar páginas do BP
4. identificar páginas da DRE
5. identificar exercícios ou períodos presentes
6. identificar a **unidade de medida** (Mil, MM, BI) e a **moeda** (BRL, US, EUR) do documento — para **confirmação** do usuário, não pergunta aberta (§5.2)
7. na **DRE**, localizar o **Lucro Líquido final de cada período** (linha `Lucro Líquido` — `Z35` na Shadow DRE), que será exibido ao usuário para validar a leitura
8. enviar UMA única mensagem ao usuário contendo TODAS as perguntas iniciais em formato numerado e aguardar uma resposta consolidada antes de prosseguir. As perguntas devem cobrir, nesta ordem:
   1. modelo/visão — **apenas se houver mais de uma visão**; ofertar os rótulos exatos encontrados (ver §5.1). Se houver visão única, não perguntar: apenas informar qual foi localizada
   2. páginas de BP
   3. páginas de DRE
   4. exercício/período
   5. **unidade de medida + moeda (confirmação)** — NÃO perguntar de forma aberta; **identificar no documento** a unidade (Mil/MM/BI) e a moeda (BRL/US/EUR) e pedir **confirmação** com opções por LETRAS (ver §5.2). Ex.: "Identifiquei que a unidade de medida e a moeda estão em **MM - BRL**. Está correto?"
   6. confirmação para iniciar a alocação — **exibir o Lucro Líquido localizado por período** e pedir validação da leitura

Regras de interação:
- agrupar todas as perguntas iniciais em UMA única mensagem numerada; nunca enviar pergunta por pergunta em mensagens separadas
- **as OPÇÕES de escolha dentro de uma pergunta (ex.: visões/modelos, abas de Shadow/Memória) são rotuladas com LETRAS (A, B, C...), não números**; o usuário pode responder pela letra ou pelo rótulo
- aguardar uma resposta do usuário que cubra todos os itens antes de iniciar a alocação
- se a resposta vier incompleta, repetir em UMA única mensagem apenas os itens pendentes (sem refazer os já respondidos)
- sempre perguntar com base apenas nas opções realmente encontradas
- preferir confirmação objetiva ou escolha entre opções encontradas
- exceção: perguntas surgidas DURANTE a alocação (ex.: escolha de aba de Memória Anterior, ambiguidade pontual em uma conta) podem ser feitas isoladamente conforme necessário

---

## 5.1. Detecção de visões/modelos vs períodos

A pergunta de "modelo" só faz sentido quando o documento apresenta **mais de uma visão** do mesmo período. Antes de perguntar qualquer coisa, ler o documento e classificar o que foi encontrado em **duas dimensões distintas** que não devem ser confundidas:

### a) Visões/modelos (escopo da consolidação)

Diferentes ESCOPOS da mesma entidade para o mesmo período. Aparecem como títulos de seção ou cabeçalhos de coluna. Exemplos de rótulos:

- `Individual` / `Controladora`
- `Consolidado` / `Consolidadas`
- `Combinado`
- `Controladora` e `Consolidado` lado a lado

Quando há **duas ou mais** visões, o usuário precisa escolher qual usar.

### b) Períodos / colunas de saldo (tempo) — NÃO são modelos

Representam TEMPO, não escopo. **Nunca** tratar como "modelo" nem oferecer como opção de modelo ao usuário:

- `Saldo Anterior` / `Saldo Atual`
- `Saldo Inicial` / `Saldo Final`
- datas (`31/12/2024`, `31/12/2025`)
- `Exercício Atual` / `Exercício Anterior`
- anos (`2023`, `2024`, `2025`)

Estas colunas mapeiam para `Ano 1/2/3` (regra de períodos). Confundir `Saldo Anterior`/`Saldo Atual` com "modelos" é exatamente o erro a evitar.

### Regra de decisão (consolidada)

1. **Visão única** (ex.: balancete de uma só entidade, demonstração com um único escopo): NÃO perguntar modelo. Informar em uma frase — "Documento com visão única: <descrição localizada>" — e seguir para as demais perguntas (páginas, período, confirmação).
2. **Duas ou mais visões**: listar ao usuário **exatamente os rótulos encontrados no documento** (verbatim, sem traduzir nem inventar), rotulados com **LETRAS (A, B, C...)**, e pedir a escolha.
3. Em qualquer caso, **as opções oferecidas devem ser as efetivamente localizadas no arquivo**. Nunca apresentar `Individual`/`Consolidado`/`Controladora` como opções fixas se não estiverem no documento.
4. Permitir que o usuário responda com a **letra** da opção ou com o próprio rótulo.

### Balancete — caso comum de visão única

Um balancete contábil típico tem: código hierárquico + descrição da conta + colunas de saldo (`Saldo Anterior`, `Débito`, `Crédito`, `Saldo Atual`). Tratamento:

- normalmente representa **uma única entidade** → visão única, **não perguntar modelo**
- as colunas `Saldo Anterior` / `Saldo Atual` são **períodos**, não modelos → mapear conforme a regra de `Ano 1/2/3`
- se restar dúvida sobre quais colunas usar como período, perguntar sobre **período/coluna de saldo** (não sobre "modelo")

### Exemplos

- **Demonstração auditada com colunas "Controladora" e "Consolidado":** duas visões → listar `Controladora` e `Consolidado` (rótulos do documento) e pedir escolha.
- **Balancete com colunas "Saldo Anterior" e "Saldo Atual":** visão única → informar "Documento com visão única (balancete da entidade)"; tratar as duas colunas como períodos (anterior e atual), nunca como modelos.
- **DRE única sem rótulo de escopo:** visão única → seguir sem perguntar modelo.
- **Arquivo com abas/seções "Individual" e "Consolidado":** duas visões → perguntar qual usar, com esses rótulos exatos.

---

## 5.2. Confirmação de unidade de medida e moeda

A unidade de medida e a moeda **não são perguntadas de forma aberta**: a GPT as **identifica no próprio documento** e pede **confirmação** ao usuário (item 5 das perguntas iniciais), numa única pergunta com opções rotuladas por LETRAS:

> Identifiquei no arquivo que a unidade de medida e a moeda estão em **<UNIDADE> - <MOEDA>** (ex.: `MM - BRL`). Está correto?
> - **A** — Unidade e moeda estão corretas
> - **B** — Necessário multiplicar todos os valores por 1.000
> - **C** — Necessário dividir todos os valores por 1.000
> - **D** — Usar outra moeda e valores de referência

Tratamento da resposta — a conversão é feita pela **GPT** e os valores já entram **convertidos** em `Ano 1/2/3` da `Rastreabilidade`:

- **A** — manter os valores lidos; unidade e moeda = as identificadas
- **B** — **multiplicar cada valor por 1.000** antes de gravar na `Rastreabilidade`
- **C** — **dividir cada valor por 1.000** antes de gravar na `Rastreabilidade`
- **D** — fazer um follow-up perguntando: (a) **qual moeda** usar — `BRL`, `USD` ou `EUR` — e (b) se deve **multiplicar** ou **dividir** por 1.000; aplicar a moeda escolhida e a conversão (×1.000 ou ÷1.000) aos valores antes de gravar

Regras da conversão:
- aplicar a **todos** os valores numéricos (BP e DRE), preservando o **sinal** de cada valor e a regra de sinal (§14)
- é uma operação aritmética sobre o valor (×1.000 ou ÷1.000); não altera o alinhamento de anos nem a estrutura da `Rastreabilidade`
- a unidade e a moeda **confirmadas** (em `D`, a moeda escolhida) são as que vão para a aba `Base de dados` (`--unidade-medida`, `--moeda`; §29.2-29.3)

---

## 6. Abas obrigatórias do template
O template deve conter:
- `Shadow`
- `Rastreabilidade`
- `Listas`

Regras:
- não alterar a aba `Listas`, exceto pelo processamento descrito neste guia
- usar sempre o template como base do output
- não apagar, recriar, renomear ou reordenar abas

---

## 7. Identificação e uso da Shadow
Uma aba é `Shadow` quando:
- `A1 = "Shadow Empresa:"`

Uso da Shadow:
- ler `Memoria Anterior` (`C`/`U`) apenas como referência histórica; não é unida à `Memoria Atual`
- `Memoria Atual` (`H`/`Z`) é fórmula dinâmica gravada pelo script (ver §8) — não colar texto
- preservar fórmulas, listas, validações e estrutura do template

Se o usuário enviar um arquivo Excel adicional:
- usar apenas a aba `Shadow`, quando existir e quando `A1 = "Shadow Empresa:"`
- não usar o arquivo adicional como fonte de linhas de leitura contábil
- não importar contas do arquivo adicional para `Rastreabilidade`

### Regra para múltiplas abas Shadow
Se o arquivo Excel utilizado no processo contiver mais de uma aba válida de `Shadow`:
- considerar como `Shadow` toda aba em que `A1 = "Shadow Empresa:"`
- identificar o nome da empresa pela célula `B1`
- listar no chat todas as opções encontradas rotuladas com LETRAS (A, B, C...)
- pedir ao usuário que escolha a empresa desejada
- permitir que o usuário responda com a letra da opção ou com o próprio nome da empresa
- somente após a escolha explícita do usuário usar a aba correspondente como base de `Memoria Anterior`
- nunca escolher automaticamente uma aba `Shadow` quando houver mais de uma opção válida

Exemplo de interação:
1. Empresa ABC
2. Empresa XYZ
3. Holding Brasil

O usuário pode responder:
- `1`
- `Empresa ABC`

### Regra estrutural obrigatória da Shadow
Toda leitura e escrita na Shadow deve respeitar a estrutura contábil da linha.

A chave estrutural obrigatória é:
- `Destino no Template | Grupo | Sub Categoria`

Regras:
- nunca usar apenas o nome da conta como chave única para Shadow
- contas homônimas em Ativo, Passivo e DRE devem ser tratadas como linhas diferentes
- contas homônimas em Circulante e Não Circulante devem ser tratadas como linhas diferentes
- a `Memoria Atual` é gravada pelo script como fórmula que casa `Destino no Template` (`K`) = `A`/`S` da linha e `Alocação da Hierarquia` (`D`) = `Sim` — a mesma referência da coluna de valor (`B`/`T`)

---

## 8. Estrutura atual da Shadow

### Ativos
- Contas: `A5:A39`
- Valores anteriores: `B5:B39`
- Memoria Anterior: `C5:C39`
- Anos: `E5:G39`
- Memoria Atual: `H5:H39` (fórmula dinâmica gravada pelo script)
- Memoria Atual Ajustada: `I5:I39` (fórmula do template; consome `H`)
- Retirar: `J5:M39`
- Adicionar: `N5:Q39`

### Passivos
- Contas: `A45:A79`
- Valores anteriores: `B45:B79`
- Memoria Anterior: `C45:C79`
- Anos: `E45:G79`
- Memoria Atual: `H45:H79` (fórmula dinâmica gravada pelo script)
- Memoria Atual Ajustada: `I45:I79` (fórmula do template; consome `H`)
- Retirar: `J45:M79`
- Adicionar: `N45:Q79`

### DRE
- Contas: `S5:S39`
- Valores anteriores: `T5:T39`
- Memoria Anterior: `U5:U39`
- Anos: `W5:Y39`
- Memoria Atual: `Z5:Z39` (fórmula dinâmica gravada pelo script)
- Memoria Atual Ajustada: `AA5:AA39` (fórmula do template; consome `Z`)
- Inversor de Sinal: `AB5:AB39`
- Retirar: `AC5:AF39`
- Adicionar: `AG5:AJ39`

Regras:
- `Memoria Atual` (`H`/`Z`): fórmula de **array dinâmico** gravada pelo script — string com `_xlfn._xlws.FILTER` + `_xlfn.TEXTJOIN` dentro de `IFERROR` (usar função dinâmica, como na `Listas`, evita o operador de interseção implícita `@` que a fórmula CSE `t="array"` recebia no Excel) — que lista as `Chave`s (`Origem|Grupo|Sub`) de todas as origens da `Rastreabilidade` com `Destino no Template` = `A`/`S` da linha e `Alocação da Hierarquia` = `Sim`, no formato `(k1) + (k2) + ...`. Recalcula sozinha ao realocar/adicionar contas; as restrições de `|Ativo|`/`|Passivo|`/`|DRE|`/`Sub Categoria` abaixo passam a ser garantidas pela classificação correta na `Rastreabilidade` (validada na origem)
- não alterar conteúdo manual do usuário nas áreas de `Retirar` e `Adicionar`
- não sobrescrever fórmulas do template
- a única exceção permitida nessas áreas é a reaplicação das validações de dados via Python
- a `Memoria Atual` de uma linha do Ativo só pode conter itens marcados com `|Ativo|`
- a `Memoria Atual` de uma linha do Passivo só pode conter itens marcados com `|Passivo|`
- a `Memoria Atual` de uma linha da DRE só pode conter itens marcados com `|DRE|`
- em Ativo e Passivo, a `Memoria Atual` deve respeitar também a `Sub Categoria`
- para linhas de DRE, a `Sub Categoria` utilizada na memória deve ser `DRE`
- para linhas de Patrimônio Líquido, a `Sub Categoria` utilizada na memória deve ser `PL`
- nunca escrever automaticamente na `Memoria Atual Ajustada`
- nunca escrever automaticamente no `Inversor de Sinal`
- a escrita automática (fórmula) continua restrita a `H` e `Z`

---

## 9. Proteção de áreas
As áreas protegidas do template são:
- `I:Q`
- `AA:AJ`

Regras:
- nunca limpar
- nunca sobrescrever
- nunca recriar
- nunca preencher automaticamente conteúdo nessas faixas
- nunca alterar fórmulas existentes nessas faixas
- exceção única: reaplicar validações de dados nas células manuais previstas

---

## 10. Cabeçalhos de ano
Preencher com o ano real, nunca com `Ano 1`, `Ano 2` ou `Ano 3`.

Células e blocos obrigatórios:
- Ativo: `E5:G39`
- Passivo: `E45:G79`
- DRE: `W5:Y39`

Regras:
- preencher com o ano real identificado no documento
- respeitar a ordem cronológica do documento aprovado pelo usuário
- **alinhar à DIREITA**: o ano mais recente vai sempre na ÚLTIMA coluna de ano (Ano 3 / `G`/`Y`); com menos de 3 anos, as colunas iniciais (Ano 1[/2]) ficam vazias. O script faz esse alinhamento e as fórmulas da Shadow casam por valor do ano
- na `Rastreabilidade`, a coluna `Ano` deve usar sempre o ano real identificado no documento
- nunca usar placeholders como `Ano 1`, `Ano 2`, `Ano 3`

---

## 11. Estrutura do Dicionário de Contas
O arquivo `Dicionário de Contas.xlsx` deve ser lido em formato tabular simples, preferencialmente em uma única sheet, contendo as colunas:

1. `Origem`
2. `Destino no Template`
3. `Grupo`
4. `Sub Categoria`

Regras:
- `Origem` é a descrição de entrada para matching
- `Destino no Template` é a conta destino oficial
- `Grupo` e `Sub Categoria` devem ser usados como restrições obrigatórias de classificação
- não alocar uma origem em grupo diferente do indicado no dicionário
- não inverter Ativo e Passivo quando o dicionário definir explicitamente o grupo
- mesmo que duas linhas do template tenham o mesmo nome, o dicionário só pode casar com a linha estrutural compatível
- para contas classificadas como DRE, a subcategoria obrigatória deve ser `DRE`
- para as contas de Patrimônio Líquido abaixo, a classificação obrigatória deve ser `Grupo = Passivo` e `Sub Categoria = PL`:
  - `PARTICIPAÇÕES MINORITÁRIAS`
  - `Capital Social`
  - `Lucros Acumulados`
  - `Outras Reservas`

---

## 12. Estrutura da Rastreabilidade
A aba `Rastreabilidade` deve receber as linhas capturadas no OCR do documento principal dentro do escopo aprovado pelo usuário.

Colunas obrigatórias (14 colunas; `Totalizador` (C) é derivada pelo script e `Chave`/`Chave Destino` (M/N) são escritas pelo script):
1. `Origem`                  (coluna A)
2. `Hierarquia`              (coluna B — nome da conta-pai imediata; para **totalizador** (pai) e top-level, o nome da **própria conta** — o script aplica isso a todo totalizador detectado, inclusive multi-nível; **sem** sufixo — o flag de pai/totalizador vai na coluna `Totalizador`)
3. `Totalizador`             (coluna C — Sim/Não; **derivado pelo script**: `Sim` quando a `Origem` é uma conta-pai/totalizador, isto é, aparece como `Hierarquia` de alguma abertura)
4. `Alocação da Hierarquia`  (coluna D — Sim/Não; julgamento do modelo, ver §16 e `Regras_Leitura_Hierarquia.md` §2)
5. `Página Referência`       (coluna E)
6. `Ano 1`                   (coluna F — renomeado para o ano real mais antigo após o pipeline)
7. `Ano 2`                   (coluna G — renomeado para o ano intermediário)
8. `Ano 3`                   (coluna H — renomeado para o ano mais recente)
9. `Grupo`                   (coluna I)
10. `Sub Categoria`          (coluna J)
11. `Destino no Template`    (coluna K)
12. `Tipo de Mapeamento`     (coluna L)
13. `Chave`                  (coluna M — escrita pelo script)
14. `Chave Destino`          (coluna N — escrita pelo script)

Regras:
- começar na linha 2
- não pular linhas indevidamente
- **CAPTURA COMPLETA (obrigatório)**: incluir **todas** as linhas financeiras das páginas selecionadas — contas **e** subcontas/aberturas. O nível escolhido para alocação recebe `Alocação da Hierarquia = Sim` (gera `Chave`/`Chave Destino` e conta no template); as **demais subcontas** entram com `Não` — o `Destino no Template` é **igualmente preenchido** (sugestão para edição manual), mas a linha **não** conta (`Chave` vazia) —, **nunca omitidas**. Não descartar aberturas por granularidade — o analista revisa e pode realocar manualmente. Detalhes: `Regras_Leitura_Hierarquia.md` §2 e §4.
- incluir uma linha por conta destino estrutural (mesclando os múltiplos anos em colunas separadas Ano 1/Ano 2/Ano 3, não em linhas)
- os valores de cada ano vão para a coluna correspondente, **alinhados à DIREITA**: o mais recente sempre em `Ano 3`; com 2 anos, `Ano 2` e `Ano 3` (e `Ano 1` vazio); com 1, só `Ano 3`. Os valores são gravados como **NUMÉRICO** (não texto)
- os cabeçalhos F1/G1/H1 ("Ano 1"/"Ano 2"/"Ano 3") são renomeados automaticamente para o ano real após o pipeline rodar (ex.: "2023", "2024", "2025"), **alinhados à direita** (mais recente em `Ano 3`/`H`); quando houver menos de 3 anos, as colunas iniciais (`Ano 1`/`F`...) ficam vazias e preservam o placeholder "Ano N"
- ordenar as linhas conforme o Plano de Contas do template (ver subseção "Ordem de inserção" abaixo)
- se existirem colunas calculadas adicionais, como `Chave` e `Chave Destino`, propagar ou escrever automaticamente as fórmulas para as novas linhas
- não incluir totais gerais nem somatórios decorativos — **exceção**: um totalizador de conta-pai escolhido como nível de alocação (`Alocação da Hierarquia = Sim`) DEVE ser incluído (ver `Regras_Leitura_Hierarquia.md` §2)
- não incluir subtotais
- não incluir cabeçalhos
- não incluir linhas decorativas
- não incluir linhas de soma

### Regras de preenchimento
- `Origem`: nome exato da conta no documento
- `Hierarquia`: nome da conta-pai imediata no documento (sem caminho completo) — **mesmo quando a abertura é, ela própria, um totalizador** (multi-nível); para contas top-level (sem pai), o **nome da própria conta** (sem sufixo). No arquivo final, o script exibe o **nome próprio** do totalizador nesta coluna (inclusive multi-nível, a pedido do especialista). O flag de **pai/totalizador** (conta com aberturas) vai na coluna `Totalizador` (C), derivada pelo script — não digitar. Em documentos **multipágina**, use o **mesmo nome de pai** em todas as aberturas do grupo, mesmo em páginas diferentes — ligue pai↔aberturas pela **estrutura**, não pela página. Regras detalhadas e exemplos: `Regras_Leitura_Hierarquia.md`
- `Página Referência`: página em que a conta aparece (se a mesma conta aparecer em múltiplas páginas, concatenar com vírgula)
- `Ano 1` / `Ano 2` / `Ano 3`: valor exato (**NUMÉRICO**) com sinal preservado, sob a coluna do ano correspondente (mais recente em `Ano 3`; sobra à esquerda); o cabeçalho dessas colunas recebe o ano real após o pipeline rodar
- `Grupo`: `Ativo`, `Passivo` ou `DRE`
- `Sub Categoria`: `Circulante` ou `Não Circulante` para Ativo/Passivo sempre que isso puder ser inferido
- para contas classificadas como `DRE`, preencher obrigatoriamente `Sub Categoria = DRE`
- para as contas abaixo, preencher obrigatoriamente `Grupo = Passivo` e `Sub Categoria = PL`:
  - `PARTICIPAÇÕES MINORITÁRIAS`
  - `Capital Social`
  - `Lucros Acumulados`
  - `Outras Reservas`
- `Destino no Template`: nome exato da conta destino sugerida — preencher em **TODAS** as linhas (`Sim` **e** `Não`). Nas linhas `Não` é apenas **sugestão** (não conta; serve para o analista incluir manualmente, se quiser)
- `Tipo de Mapeamento`: `Memoria Anterior`, `Dicionário` ou `Julgamental`. O antigo `Referência` foi **descontinuado** — linhas de contexto usam `Alocação da Hierarquia = Não` (e o script deixa o `Tipo de Mapeamento` **vazio** nelas).
- `Alocação da Hierarquia` (coluna D, Sim/Não): **AUTORITATIVA** — vem do julgamento do modelo (não é derivada do destino). **Sim** = nível efetivamente alocado no template (totalizador OU aberturas, por julgamento); só linhas `Sim` geram `Chave`/`Chave Destino` e contam. **Não** = contexto (o `Destino` fica como sugestão, sem contar). Ausente ⇒ `Não`. Nunca marcar o totalizador E suas aberturas como `Sim` (dupla contagem). Critérios e exemplos: `Regras_Leitura_Hierarquia.md` §2-§5.

### Ordem de inserção na Rastreabilidade (Plano de Contas)
As linhas devem ser inseridas seguindo a ordem do Plano de Contas do template (lido da Shadow):

1. **Ativo Circulante** — ordem das contas em `A5:A21` da Shadow (Caixa, Aplicações Financeiras, Clientes, Clientes - Grupo, -PDD, Matéria-Prima, Produtos em Elaboração, Produtos Acabados, Ajustes derivativos / cambio (AC), Adiantamento a Fornecedores, Mútuo Financeiro, Impostos a Recuperar, Outros Operacionais (AC), Outros Não Operacionais (AC))
2. **Ativo Não Circulante** — `A23:A39` (Ajustes derivativos / cambio (ANC), Impostos Diferidos, Impostos a recuperar/Crédito tributário, Mútuo Financeiro LP, Aplicações Financeiras de LP, Outros Operacionais (ANC), Outros Não Operacionais LP (ANC), Direito de Uso, - Depreciação acumulada (Direito de uso), Terreno, Edificios, maquinas e outros, -Depreciação Acumulada, Investimentos, Outros Ativos Intangiveis / Goodwill)
3. **Passivo Circulante** — `A45:A60` (Bancos, Outras Dividas Financeiras, Confirming, Dividas Fiscais de Curto Prazo, Ajustes derivativos / cambio (+), Fornecedores Externos, Fornecedores - Partes Relacionadas, Passivo de Arrendamento Circulante, Mútuo Financeiro, Salários, Impostos, Adiantamento de Clientes, Dividendos a Pagar, Outros Operacionais (PC), Outros Não Operacionais (PC))
4. **Passivo Não Circulante** — `A62:A70` (Bancos LP, Outras Dividas Financeiras LP, Dividas Fiscais LP, Ajustes derivativos / cambio (PNC), Passivo de Arrendamento LP, Mútuo Financeiro LP, Provisões, Outros Operacionais (PNC), Outros Não Operacionais (PNC))
5. **Passivo PL** — `A75:A78` (PARTICIPAÇÕES MINORITÁRIAS, Capital Social, Lucros Acumulados, Outras Reservas)
6. **DRE** — `S5:S40` da Shadow, pulando totalizadoras (Vendas Totais, -Impostos, -Custo de Produtos Vendidos, - Despesas com Vendas, - Despesas Administrativas, +/-Outras Receitas/Despesas Operacionais, +/-Provisões Operacionais, - Depreciação e amortização (imob e intang), - Depreciação/Amortização dos Arrendamentos Op., - Despesas/Custo de Aluguel, - Despesas Financeiras, + Receitas Financeiras, +/- Variações Cambiais, +/- Equivalência Patrimonial, Outros não recorrentes e/ou não operacionais, +/- Créditos Tributários, +/- Resultado de alienação do Imobilizado, - Juros de Arrendamento Operacional, - Impostos Pagos, +/- Impostos Diferidos, +/- Resultados Abrangentes, - Dividendos, +/- Participações Minoritárias)

Dentro de cada bloco, manter a ordem em que o destino aparece na Shadow. Linhas sem destino (Julgamental sem alocação) vão para o final do bloco do seu Grupo/Sub Categoria, ordenadas alfabeticamente por origem.

A `Rastreabilidade` deve refletir apenas as contas extraídas do documento principal analisado e processadas pela jornada:
- Shadow
- Dicionário de Contas
- Julgamental
- Referência (linhas sem alocação, trazidas para revisão manual do analista — ver `Regras_Leitura_Hierarquia.md`)

### Regra estrutural complementar
Se houver contas destino homônimas no template, a distinção obrigatória deve ser feita por:
- `Destino no Template`
- `Grupo`
- `Sub Categoria`

---

## 13. Colunas auxiliares da Rastreabilidade

A aba `Rastreabilidade` deve conter as colunas auxiliares:

- `Chave`
- `Chave Destino`

### Coluna Chave
A coluna `Chave` deve ser preenchida e replicada para todas as novas linhas inseridas.

Lógica desejada:
`Origem|Grupo|Sub Categoria`

Equivalente em Excel (layout A..N: Origem=A, Grupo=I, Sub Categoria=J; gerada **apenas** quando `Alocação da Hierarquia` (D) = `Sim`, senão fica vazia):
```excel
=IF($D2="Sim",A2&"|"&I2&"|"&J2,"")
````

### Coluna Chave Destino

A coluna `Chave Destino` deve ser preenchida e replicada para todas as novas linhas inseridas.

Lógica desejada:
`Destino no Template|Grupo|Sub Categoria`

Equivalente em Excel (layout A..N: Destino=K, Grupo=I, Sub Categoria=J; gerada **apenas** quando `Alocação da Hierarquia` (D) = `Sim`, senão fica vazia):

```excel
=IF($D2="Sim",K2&"|"&I2&"|"&J2,"")
```

Ao escrever via Python, usar a mesma lógica:

```excel
=IF($D2="Sim",K2&"|"&I2&"|"&J2,"")
```

Regras:

* `Chave` deve permanecer na coluna `M` (layout A..N de 14 colunas; era `K` no layout anterior)
* `Chave Destino` deve permanecer na coluna `N` (layout A..N de 14 colunas; era `L` no layout anterior)
* ambas devem ser validadas após a inserção das novas linhas
* ambas devem ser propagadas para todas as linhas novas da `Rastreabilidade`

Uso:

* validação de homônimos
* apoio à Shadow
* auditoria de memória
* prevenção de mistura estrutural
* reconciliação por destino estrutural

---

## 14. Regra absoluta de alocação estrutural

Nunca alocar contas em grupo estrutural incompatível.

Regras obrigatórias:

* ATIVO só pode ser alocado em ATIVO
* PASSIVO só pode ser alocado em PASSIVO
* DRE só pode ser alocada em DRE
* contas de DRE devem permanecer com `Sub Categoria = DRE`
* Ativo Circulante só pode ir para Ativo Circulante
* Ativo Não Circulante só pode ir para Ativo Não Circulante
* Passivo Circulante só pode ir para Passivo Circulante
* Passivo Não Circulante só pode ir para Passivo Não Circulante
* as contas abaixo devem permanecer com `Grupo = Passivo` e `Sub Categoria = PL`:

  * `PARTICIPAÇÕES MINORITÁRIAS`
  * `Capital Social`
  * `Lucros Acumulados`
  * `Outras Reservas`
* contas com `Sub Categoria = PL` só podem ser alocadas em linhas estruturais de Patrimônio Líquido

Essa validação deve existir em todos os caminhos:

1. Shadow / Memoria Anterior
2. Dicionário
3. Julgamental

Se houver qualquer incompatibilidade entre `Grupo/Sub Categoria` da origem e a linha destino no template, a alocação deve ser rejeitada imediatamente.

### Regra adicional para homônimos

O nome da conta destino nunca pode ser usado sozinho para:

* memória
* agrupamento
* matching interno
* listas auxiliares
* atualização da Shadow
* reconciliação
* validação

A chave mínima obrigatória para esses casos é:
`Destino no Template|Grupo|Sub Categoria`

---

## 14.1. Regra de sinal por prefixo do destino

Ao alocar qualquer linha em `Rastreabilidade` (Shadow, Dicionário ou Julgamental), o sinal gravado em `Ano 1/2/3` é determinado pelo **prefixo do nome da conta destino no template**, NÃO pelo sinal cru lido no OCR e NÃO pela coluna `IMPACTO no modelo` do arquivo `INTERPRETAÇÃO DE SINAL DA DRE.xlsx`.

Motivo: a fórmula de totalização do template já aplica o sinal pelo prefixo do destino (subtrai contas com `-`, soma contas com `+`). Se o OCR trouxer o valor já negativo e o gravarmos negativo, o `-` da fórmula com `-` do valor vira `+` e inverte o resultado final (efeito "menos com menos vira mais").

### Regra única

| Prefixo do destino no template | Operação interna do template | Valor que deve ser gravado em `Ano 1/2/3` |
|---|---|---|
| começa com `-` (ex.: `-Impostos`, `- Despesas com Vendas`) | subtrai | **|OCR| (sempre POSITIVO)** |
| começa com `+` mas NÃO `+/-` (ex.: `+ Receitas Financeiras`) | soma | **|OCR| (sempre POSITIVO)** |
| começa com `+/-` (ex.: `+/- Variações Cambiais`) | soma com sinal | **preservar sinal do OCR** |
| sem prefixo de sinal (ex.: `Vendas Totais`, `Outros não recorrentes e/ou não operacionais`) | soma | **preservar sinal do OCR** (sempre POSITIVO na prática para receita) |

### Lista exaustiva de destinos com prefixo `-` (sempre POSITIVO)

Estes destinos cobrem tanto a DRE quanto contas redutoras do Ativo. Para todos eles, o valor gravado deve ser **|OCR| (positivo)** — se o OCR vier negativo, inverter para positivo antes de gravar.

**Ativo redutor:**
- `-PDD`
- `-Depreciação Acumulada`
- `- Depreciação acumulada (Direito de uso)`

**DRE despesas/abatimentos:**
- `-Impostos`
- `-Custo de Produtos Vendidos`
- `- Despesas com Vendas`
- `- Despesas Administrativas`
- `- Depreciação e amortização (imob e intang)`
- `- Depreciação/Amortização dos Arrendamentos Op.`
- `- Despesas/Custo de Aluguel`
- `-  Despesas Financeiras`
- `- Juros de Arrendamento Operacional`
- `- Impostos Pagos`
- `- Dividendos`

### Destinos com prefixo `+/-` ou sem prefixo (preservar sinal do OCR)

Estes destinos representam contas que naturalmente podem ser positivas ou negativas (ex.: variações cambiais, equivalência patrimonial, outros não recorrentes). A fórmula do template soma o valor exatamente como gravado, então o sinal lido pelo OCR deve ser preservado.

- `+/-Outras Receitas/Despesas Operacionais`
- `+/-Provisões Operacionais`
- `+/- Variações Cambiais`
- `+/- Equivalência Patrimonial`
- `Outros não recorrentes e/ou não operacionais`
- `+/- Créditos Tributários`
- `+/- Resultado de alienação do Imobilizado`
- `+/- Impostos Diferidos`
- `+/- Resultados Abrangentes`
- `+/- Participações Minoritárias`

### Exemplo concreto — armadilha do duplo negativo

OCR lê: `Custo de Produtos Vendidos: 60.000` (positivo, em valor absoluto).
Conta destino: `-Custo de Produtos Vendidos` (prefixo `-`).
Valor a gravar em `Ano N` da `Rastreabilidade`: **`60.000` (POSITIVO)**.
Fórmula do template: `Vendas Líquidas - Custo de Produtos Vendidos = Vendas Líquidas - 60.000`. Correto.

Se o OCR já trouxer o CMV negativo (ex.: `-60.000`), ainda assim deve-se gravar `60.000` (positivo), porque a fórmula faria `- (-60.000) = +60.000`, invertendo o resultado bruto.

### Sobre o arquivo `INTERPRETAÇÃO DE SINAL DA DRE.xlsx`

O arquivo serve como referência semântica do impacto de cada conta no resultado (lucro vs. prejuizo), mas **a regra operacional para gravar valores em `Rastreabilidade` é o prefixo do destino**, conforme descrito acima. A classificação `IMPACTO no modelo` ajuda a decidir se uma origem deve ou não ser alocada a determinado destino na ausência de prefixo, mas não altera o sinal do valor gravado.

### Validação obrigatória

Antes de entregar o arquivo, verificar para cada linha da `Rastreabilidade`:
- linhas cujo `Destino no Template` começa com `-` ou `+` (não `+/-`) possuem valor ≥ 0 em `Ano 1`, `Ano 2` e `Ano 3`
- linhas cujo `Destino no Template` começa com `+/-` ou não tem prefixo de sinal preservam o sinal do OCR (qualquer sinal permitido)
Se alguma linha violar a regra, corrigir o sinal antes de salvar o arquivo final.

---

## 14.2. Sinal contábil ao ler BALANCETE (fonte ≠ BP/DRE estruturada)

A regra §14.1 acima trata o "sinal do OCR" como sinal **de apresentação** (o que já vale para BPs e DREs publicadas). Quando a fonte é um **balancete bruto** (com colunas Anterior/Débito/Crédito/Saldo Atual e códigos hierárquicos), o sinal lido representa **saldo contábil**, não apresentação. É obrigatório aplicar uma **conversão prévia** antes de §14.1:

```
apresentacao = saldo_balancete × sinal_grupo
sinal_grupo = +1 se grupo do DESTINO é devedor (Ativo, Despesa em DRE só para §14.1)
            = -1 se grupo do DESTINO é credor (Passivo, PL)
```

Para DRE, aplicar sinal_grupo = -1 (inverter sempre) — assim receitas (credor, saldo bal negativo) viram positivas e despesas (devedor, saldo bal positivo) viram negativas; depois §14.1 transforma em `|apres|` para destinos com prefixo `-`/`+`, ou preserva para `+/-`/sem prefixo.

**Importante:** o prefixo `(-)` no NOME da origem (ex.: `(-) PREJUÍZOS ACUMULADOS`) é apenas rótulo do plano de contas; NÃO é modificador de sinal. O saldo do balancete já reflete a natureza redutora (uma redutora de PL credor aparece com saldo positivo de débito, e a conversão `× -1` a transforma em valor de apresentação negativo, como deve ser).

**Regra do código contábil:** em balancetes com código hierárquico numerado, o **1º dígito determina o Grupo** (1=Ativo, 2=Passivo/PL, 3=Despesa, 4=Receita, 5=apuração). Esse valor **prevalece sobre o nome** ao classificar o Grupo da origem. Casos comuns de armadilha: `DESCONTOS FINANCEIROS OBTIDOS` (4.x = receita, parece despesa); `SERVIÇOS PRESTADOS POR TERCEIROS` (3.x = despesa, parece receita); `JUROS PASSIVOS` (3.x = despesa, "passivo" não é grupo 2). Receita (4.x) **nunca** vai em destino com prefixo `-`; despesa (3.x) **nunca** vai em destino sem prefixo (`Vendas Totais`).

Detalhes completos, critérios de detecção de balancete, tabela de armadilhas por nome, exemplos práticos e checklists de validação: ver `Regras_Leitura_Hierarquia.md` §8 (especialmente §8.7 e §8.9).

---

## 14.3. Fechamento do balanço (Ativo = Passivo + PL): auto-correção / fail-fast

`Ativo = Passivo + PL` é **regra de fechamento obrigatória**. Antes de entregar, validar por ano (somando as linhas efetivamente alocadas). **Se não fechar (diferença acima da tolerância de arredondamento / ~1% do Ativo), é erro bloqueante: NÃO entregar.** Em vez de aceitar a diferença, **investigar a causa, refazer a análise/alocação e revalidar até fechar** — **sem** forçar uma conta de destino específica (o nível correto é decidido por julgamento conforme a estrutura do documento/template; nunca assumir um nome fixo).

Causas mais comuns a investigar (nesta ordem):
1. **Balancete não encerrado**: a diferença ≈ **Resultado do Exercício** da DRE → o resultado do período não foi transportado ao PL. Levar o resultado para a conta de PL que o documento/estrutura indica (lucro **aumenta** o PL; prejuízo **reduz** — preservar o sinal econômico).
2. **Sinal/conversão (§14.2)**: saldo de balancete não convertido para apresentação (ou `(-)` no nome preservado em vez de invertido).
3. **Conta omitida** (captura incompleta), **dupla contagem** (totalizador + aberturas alocados juntos) ou **Grupo/Sub trocado** (o 1º dígito do código manda).

Só marcar como concluído após `Ativo = Passivo + PL` fechar. Se genuinamente não fechar (documento incompleto ou pedido explícito de manter o balancete não encerrado), reportar no parecer a diferença, a causa provável e as contas suspeitas. Protocolo completo: `Regras_Leitura_Hierarquia.md` §8.6.1.

---

## 14.4. Consolidação de totalizadores e cobertura de valores (auto-validação antes de entregar)

Estas conferências são **obrigatórias antes de gerar/entregar o arquivo** — aplicá-las por conta própria, sem esperar o usuário apontar (foram dores reais de teste).

**Lembrete-padrão ao ler o arquivo (passo *default*):** para cada **hierarquia relevante**, decidir o nível de alocação aplicando **até ~4 contas alocadas (`Sim`) por hierarquia** — acima disso, **consolidar no totalizador**. Esse lembrete (do analista) melhora muito o resultado e deve valer para **todos os cenários**, não só quando o totalizador é óbvio.

**1. Nível de alocação (totalizador × aberturas).** Para cada bloco pai-filho, decidir o nível com julgamento (detalhe em `Regras_Leitura_Hierarquia.md` §2):
- poucas aberturas com valor analítico próprio → aberturas `Alocação da Hierarquia = Sim`, totalizador `Não`;
- **muitas aberturas atomizadas para o MESMO destino** (acima de ~**4 por hierarquia**; fornecedores, clientes, tributos, contas correntes, salários por funcionário, NFs) → **totalizador `Sim`** e aberturas `Não` (contexto, valores preservados) — reduz a fragmentação da Shadow;
- aberturas que iriam para **destinos diferentes** → **não** promover o totalizador (ele misturaria classificações); manter as aberturas e revisar a coerência hierárquica.

O parecer do script ajuda a decidir: `validate_totalizer_promotion` aponta blocos sub-consolidados (muitos filhos `Sim` no mesmo destino com o pai `Não`); `validate_alocacao_consistency` aponta dupla contagem (pai **e** filhos `Sim`); `validate_sibling_consistency` aponta filhos do mesmo pai em destinos divergentes. **Agir sobre esses avisos antes de entregar** (não tratá-los como opcionais).

**2. Cobertura de valores (CAPTURA COMPLETA).** Toda linha capturada mantém o valor do ano em `Ano 1/2/3`, **inclusive as linhas de contexto (`Alocação da Hierarquia = Não`)** — elas não somam na Shadow, mas o valor permanece na Rastreabilidade para revisão/realocação manual. O parecer traz a matriz `cobertura_valores` (`Alocação Sim/Não × com/sem valor`) e o total `contas_capturadas`; reportá-la ao usuário e garantir que **nenhuma linha `Sim` fique sem valor**.

**3. Não alocar contas zeradas.** Conta com **valor zero (ou vazio) em todos os anos não deve ser alocada (`Sim`)**: alocar zero vira ruído e **polui a Memoria Anterior futura** (quando essa memória virar `Memoria Anterior`). Capture-a como contexto (`Não`). O parecer traz o contador `sim_alocadas_zeradas` e lista as origens em `validate_year_value_coverage`.

---

## 15. Regra absoluta de totais bloqueados

As células abaixo são linhas totalizadoras, agregadoras, linhas com fórmula ou destinos bloqueados. Nunca devem receber alocação, nunca devem receber novas origens na `Memoria Atual` e nunca podem ser usadas como destino final.

### Ativo

* `H7` = `Disponibilidades`
* `H11` = `Clientes Líquido`
* `H15` = `Estoques`
* `H22` = `Total Ativo Circulante`
* `H30` = `Total Ativo Realizável LP`
* `H33` = `Direito de Uso Liquido`
* `H37` = `Imobilizado Liquido`
* `H40` = `Total Ativo Fixo`
* `H41` = `Total Ativo`

### Passivo

* `H52` = `Fornecedores`
* `H61` = `Total Passivo Circulante`
* `H71` = `Total Passivo Não Circulante`
* `H72` = `Total Passivo`

### Patrimônio Líquido

* `H79` = `Patrimônio líquido`
* `H80` = `Recursos própios - Reportado com IFRS16`
* `H84` = `Total Passivo - Recursos Próprios`

### DRE

* `Z7` = `Vendas líquidas`
* `Z9` = `Resultado Bruto`
* `Z12` = `Resultado da Exploração`
* `Z15` = `Resultado Operacional (EBIT)`
* `Z18` = `EBITDA`
* `Z19` = `- Despesas/Custo de Aluguel`
* `Z20` = `EBITDA ex-IFRS16`
* `Z23` = `+/- Resultado Financeiro`
* `Z26` = `Lucro antes de Impostos e Extraordinários`
* `Z31` = `+/- Resultado Extraorinário`
* `Z32` = `Lucro antes de Impostos`
* `Z35` = `Lucro Líquido`
* `Z37` = `Lucro Líquido+Resultado Abrangente a Distribuir`
* `Z38` = `Lucro líquido a distribuir ajustado`
* `Z41` = `Lucro após dividendos e minoitários`

Regras:

* se uma conta aparentar pertencer a um total, não alocar no total
* procurar a descrição analítica correta pertencente ao bloco daquela conta
* preferir sempre o menor nível analítico estruturalmente compatível
* se não houver conta analítica segura, não alocar e manter como `Julgamental`
* nunca montar memória nova em linhas bloqueadas
* nunca reutilizar memória anterior de linha bloqueada como destino de novas contas

### Caso específico: `- Despesas/Custo de Aluguel` (linha S19 / valor Z19)

Essa linha é um **totalizador de reconciliação IFRS16** (fica entre `EBITDA` e `EBITDA ex-IFRS16`) e **nunca** é destino de alocação. Ao encontrar uma despesa/custo de aluguel (locação) no documento:

* **nunca** alocar em `- Despesas/Custo de Aluguel`
* rerotear **por julgamento** para a conta analítica de despesa operacional compatível com o contexto (ex.: `- Despesas Administrativas`, `- Despesas com Vendas` ou `+/-Outras Receitas/Despesas Operacionais`)
* se nenhuma conta analítica for estruturalmente segura, manter como `Julgamental` (sem destino) — nunca forçar no totalizador
* a mesma lógica vale para outras linhas de reconciliação/ajuste que sejam totalizadoras (ex.: depreciação/amortização e juros de arrendamento)

### Caso específico: Depreciação e Amortização (linhas S16 e S17)

As linhas `S16` = `- Depreciação e amortização (imob e intang)` e `S17` = `- Depreciação/Amortização dos Arrendamentos Op.` compõem a ponte de reconciliação do EBITDA (ficam entre `Resultado Operacional (EBIT)` e `EBITDA`) e **nunca** são destino de alocação direta:

* **nunca** alocar nada em `S16` nem `S17`
* se o documento trouxer valores de depreciação/amortização (normalmente embutidos em custos ou despesas), lançá-los na conta analítica de **custo ou despesa** correspondente à hierarquia (ex.: `-Custo de Produtos Vendidos`, `- Despesas Administrativas`, `- Despesas com Vendas`) — nunca nas linhas S16/S17
* se nenhuma conta analítica for estruturalmente segura, manter como `Julgamental` (sem destino)

### Caso específico: `+/-Provisões Operacionais` (linha S14)

A linha `S14` = `+/-Provisões Operacionais` **só** deve receber alocação quando o valor vier da **memória anterior** (Shadow / `Tipo de Mapeamento = Memoria Anterior`):

* alocar em `+/-Provisões Operacionais` **apenas** quando houver correspondência na memória anterior daquela linha
* não havendo memória anterior, **não** alocar em `S14`; seguir as regras gerais desta seção (rerotear por julgamento para a conta analítica operacional compatível, ex.: `+/-Outras Receitas/Despesas Operacionais`, ou manter como `Julgamental` sem destino)

---

## 16. Ordem obrigatória de alocação

A ordem de alocação deve ser:

1. `Shadow / Memoria Anterior`
2. `Dicionário de Contas`
3. `Julgamental`

Regras:

* alocar no nível mais analítico possível
* preferir conta específica à genérica
* não alocar em total, subtotal, cabeçalho ou agregadora se houver subconta adequada
* **a hierarquia do documento prevalece**: o destino deve respeitar a conta-pai, não só a natureza do nome — filhos herdam a classificação do pai (ex.: itens sob `Despesas Gerais e Administrativas` vão para `- Despesas Administrativas`, ainda que o nome sugira vendas); prevalece sobre um mapeamento genérico do dicionário que contradiga a estrutura
* **"mais analítico" não é fragmentar**: se os filhos de um mesmo pai forem ambíguos ou se dispersariam em destinos diferentes, prefira alocar o TOTALIZADOR do pai (`Alocação da Hierarquia = Sim`) e marcar os filhos como `Não` — **trazendo todos os filhos, nunca omitir** (a regra de não-fragmentar é só sobre a ALOCAÇÃO, não sobre a captura; anti-dupla-contagem; ver `Regras_Leitura_Hierarquia.md` §5)
* só usar “Outros” se existir no template e fizer sentido
* nenhuma conta válida pode ser descartada silenciosamente
* se não houver destino estruturalmente compatível, não alocar
* toda etapa deve respeitar Grupo e Sub Categoria
* toda etapa deve respeitar chave estrutural composta quando houver homônimos
* toda etapa deve respeitar a lista de totais bloqueados

---

## 17. Memoria Atual

A `Memoria Atual` deve ser construída a partir da `Memoria Anterior` textual válida + novas origens alocadas para a mesma conta destino estrutural.

Regras:

* ignorar fórmulas ou conteúdos iniciados por `=`
* ignorar fórmulas ou expressões automáticas incompatíveis com memória textual
* usar formato: `(Origem|Grupo|Sub Categoria)`
* não incluir página, valor ou fórmula
* nunca consolidar memória apenas por nome do destino
* toda montagem de memória deve usar chave estrutural:

  * `Destino no Template`
  * `Grupo`
  * `Sub Categoria`
* se duas linhas tiverem o mesmo nome e grupos diferentes, devem manter memórias separadas
* se duas linhas tiverem o mesmo nome e subcategorias diferentes, devem manter memórias separadas
* é proibido que uma linha receba memória com grupo incompatível com sua própria estrutura
* é proibido escrever automaticamente na `Memoria Atual Ajustada`
* em Ativo e Passivo, a escrita automática só pode ocorrer em `H`
* em DRE, a escrita automática só pode ocorrer em `Z`
* para contas classificadas como DRE, a memória deve usar `Sub Categoria = DRE`
* para as contas abaixo, a memória deve usar `Grupo = Passivo` e `Sub Categoria = PL`:

  * `PARTICIPAÇÕES MINORITÁRIAS`
  * `Capital Social`
  * `Lucros Acumulados`
  * `Outras Reservas`

### Regras adicionais de integridade da memória

* uma linha de Ativo não pode conter itens com `|Passivo|` ou `|DRE|`
* uma linha de Passivo não pode conter itens com `|Ativo|` ou `|DRE|`
* uma linha de DRE não pode conter itens com `|Ativo|` ou `|Passivo|`
* em Ativo e Passivo, a `Sub Categoria` da memória deve coincidir com a da linha da Shadow
* em linhas de DRE, a `Sub Categoria` da memória deve ser `DRE`
* em linhas de Patrimônio Líquido, a `Sub Categoria` da memória deve ser `PL`
* contas homônimas devem manter memória segregada por estrutura, mesmo que o texto do destino seja idêntico
* linhas bloqueadas por total não podem receber novas memórias

---

## 18. Listas e validações

* usar sempre o template como base do output; nunca recriar o workbook do zero
* preservar abas, fórmulas, estilos, validações, listas, proteção e macros quando existirem
* reaplicar via Python as validações de dados da Shadow conforme o guia
* gravar via Python fórmulas dinâmicas em `Listas!A2`, `Listas!C2` e `Listas!E2` para garantir deduplicação em tempo real e impedir alocação duplicada na Data Validation da Shadow
* ao escrever fórmulas via Python, usar a sintaxe interna do Excel: funções em inglês, separadores por vírgula e os prefixos OOXML obrigatórios para funções de array dinâmico (`_xlfn.LET`, `_xlfn._xlws.SORT`, `_xlfn.UNIQUE`, `_xlfn._xlws.FILTER`, `_xlfn.TOCOL`, `_xlfn.VSTACK`, `_xlpm.<param>`)

### Regra estrutural das listas auxiliares

Se a aba `Listas` ou qualquer lista auxiliar consumir dados da `Rastreabilidade`, a lógica deve evitar agrupamentos apenas por nome de destino quando houver risco de homônimos.

Sempre que necessário, usar chave estrutural composta.

### Fórmulas dinâmicas da aba Listas

**Modo template-managed (Apr/2026):** as fórmulas A2/C2/E2 da aba `Listas` vivem **diretamente no template_plano_de_contas.xlsx**, gravadas pelo usuário no Excel. O script `gerar_excel_contabil.py` **não sobrescreve** essas células nem limpa A3+/C3+/E3+ — a chamada `apply_listas_formulas` está desativada em `main()`.

Por que mudamos: em algumas builds do Excel 365 (incluindo a do ambiente do analista), gravar as fórmulas via openpyxl + reaplicar metadata `XLDAPR` + `cm="1"` + `calcFeatures` ainda não destrava 100% o operador `@`. Quando o próprio Excel grava as fórmulas no template (com `Enter`, não `Ctrl+Shift+Enter`), o workbook fica corretamente "blessed" como DA-aware e o `@` não aparece. O script preserva o conteúdo da Listas e apenas reaplica `xl/metadata.xml` + `cm="1"` + `calcFeatures` após `wb.save` (senão o openpyxl destruiria essas estruturas).

A aba `Listas` deve ser preenchida via Python com fórmulas dinâmicas (Excel 365) em apenas três células-âncora; o spill se encarrega das demais linhas. Essa abordagem mantém a deduplicação em tempo real e permite que a Data Validation da Shadow rejeite seleção repetida.

Conteúdo obrigatório:

* `Listas!A2`: lista única e ordenada das chaves vindas de `Rastreabilidade!$K$2:$K$1048576` (coluna `Chave` no layout de 12 colunas)
* `Listas!C2`: subset de `A2` excluindo itens já usados nas faixas Adicionar da Shadow
* `Listas!E2`: subset de `A2` excluindo itens já usados nas faixas Retirar da Shadow

Conteúdo de referência (o usuário grava manualmente no template, usando `Enter` no Excel — nunca `Ctrl+Shift+Enter`):

```python
f_a2 = (
    '=IFERROR(_xlfn._xlws.SORT(_xlfn.UNIQUE(_xlfn._xlws.FILTER('
    'Rastreabilidade!$K$2:$K$1048576,'
    'Rastreabilidade!$K$2:$K$1048576<>""'
    '))),"")'
)
f_c2 = (
    '=IFERROR(_xlfn.LET('
    '_xlpm.Base,_xlfn._xlws.SORT(_xlfn.UNIQUE(_xlfn._xlws.FILTER('
    'Rastreabilidade!$K$2:$K$1048576,'
    'Rastreabilidade!$K$2:$K$1048576<>""))),'
    '_xlpm.Usados,_xlfn.TOCOL(_xlfn.VSTACK('
    'Shadow!$N$5:$Q$39,Shadow!$N$45:$Q$79,Shadow!$AG$5:$AJ$39),1),'
    '_xlfn._xlws.FILTER(_xlpm.Base,ISNA(MATCH(_xlpm.Base,_xlpm.Usados,0)))'
    '),"")'
)
f_e2 = (
    '=IFERROR(_xlfn.LET('
    '_xlpm.Base,_xlfn._xlws.SORT(_xlfn.UNIQUE(_xlfn._xlws.FILTER('
    'Rastreabilidade!$K$2:$K$1048576,'
    'Rastreabilidade!$K$2:$K$1048576<>""))),'
    '_xlpm.Usados,_xlfn.TOCOL(_xlfn.VSTACK('
    'Shadow!$J$5:$M$39,Shadow!$J$45:$M$79,Shadow!$AC$5:$AF$39),1),'
    '_xlfn._xlws.FILTER(_xlpm.Base,ISNA(MATCH(_xlpm.Base,_xlpm.Usados,0)))'
    '),"")'
)
```

No Excel: clicar em `Listas!A2`, colar a fórmula `f_a2` (sem aspas), pressionar `Enter`. Repetir para `C2` e `E2`. Salvar o template. O Excel grava com prefixos `_xlfn.`/`_xlfn._xlws.`/`_xlpm.` automaticamente, sem `t="array"`, com `cm="1"` + `xl/metadata.xml` + `calcFeatures` corretos. Esse template "blessed" é o input do pipeline.

Regras:

* o usuário grava as fórmulas A2/C2/E2 **uma vez** no template via Excel (`Enter`, não `Ctrl+Shift+Enter`); o pipeline preserva-as em todas as execuções subsequentes
* `apply_listas_formulas(listas_ws)` está **desativada** em `main()` (chamada comentada); a função em si está preservada no módulo caso seja necessário reverter
* `apply_dynamic_array_artifacts(output_path, template_path)` é chamada após `wb.save` e: (a) reimpõe A2/C2/E2 **verbatim do template** (fórmula + `cm="1"`), garantindo que a fórmula gerada seja idêntica à do template; (b) reaplica `xl/metadata.xml` + `Override` + `Relationship` + `calcFeatures` — o openpyxl strippa `cm` e pode strippar `metadata.xml`/`calcFeatures`
* `verify_dynamic_array_artifacts(output_path, template_path)` roda como pós-condição: confere os metadados e que A2/C2/E2 são **idênticas ao template**; falha explicitamente se algo divergir (impede entrega com `@`)
* nunca gravar literais nas colunas A, C ou E da `Listas` (linha 3+) no template — todo conteúdo abaixo da fórmula é fruto do spill dinâmico, qualquer literal causaria `#SPILL!`
* o template **não pode** ter as fórmulas em modo CSE (`{=...}` na barra de fórmulas): o openpyxl preservaria `<f t="array" ref="A2">` e o Excel trataria como single-cell array sem spill. Sempre usar `Enter` no Excel ao gravar
* o template pode (e deve) ter `cm="1"` em A2/C2/E2 + `xl/metadata.xml` + `calcFeatures` em `xl/workbook.xml`; openpyxl pode strippar parte disso, mas as funções de pós-processamento reinjetam tudo no output
* o bloco que setava `wb.active = listas_index` + `selection A2` foi também desativado: o output preserva a active sheet / selection que o usuário configurou no template

### Metadados de Dynamic Array (obrigatório após `wb.save`)

Mesmo gravando a fórmula como string plana (`<f>...</f>` sem `t="array"`), o Excel ao abrir um xlsx que **não contém** `xl/metadata.xml` adiciona automaticamente o operador de **interseção implícita** (`@`) antes de funções que retornam array, forçando avaliação escalar e impedindo o spill. O usuário verá algo como `=@IFERROR(SORT(...))` ou `=IFERROR(@LET(...))` na barra de fórmulas e precisaria editar cada célula manualmente para o spill funcionar.

Para evitar isso, é **obrigatório** pós-processar o xlsx (após `wb.save`) adicionando metadados OOXML que marcam as células A2/C2/E2 como spill anchors. A função `apply_dynamic_array_metadata(xlsx_path)` em `gerar_excel_contabil.py` faz isso e é chamada automaticamente no fim de `main()`.

Modificações que a função aplica no zip do xlsx:

* cria `xl/metadata.xml` com:

  * `<metadataType name="XLDAPR" minSupportedVersion="120000" .../>`
  * `<futureMetadata name="XLDAPR">` contendo `<xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/>` sob a uri `{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}`
  * `<cellMetadata>` com um bloco `<rc t="1" v="0"/>` (referência índice 1 do `metadataTypes`, índice 0 do `futureMetadata`)
* adiciona em `[Content_Types].xml`:

  ```xml
  <Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/>
  ```
* adiciona em `xl/_rels/workbook.xml.rels`:

  ```xml
  <Relationship Id="rIdN" Type="http://schemas.microsoft.com/office/2017/06/relationships/sheetMetadata" Target="metadata.xml"/>
  ```
* substitui no XML da aba `listas` cada `<c r="A2">`, `<c r="C2">`, `<c r="E2">` por `<c r="A2" cm="1">` (o `cm="1"` referencia o índice 1, base 1, do `cellMetadata`)

A função é idempotente: se `xl/metadata.xml` já existe, o conteúdo é sobrescrito com o canônico; se `cm="1"` já está na célula, nada é alterado; se o `Override`/`Relationship` já existem, não duplicam.

Regras:

* sempre chamar `apply_dynamic_array_metadata(output_path)` **depois** de `wb.save(output_path)` e de `verify_shadow_integrity` — `openpyxl` não preserva nem expõe `cm` nem `xl/metadata.xml` ao re-salvar
* nunca tentar gravar `cm="1"` via openpyxl: a biblioteca não suporta o atributo, ele tem que ser escrito por manipulação direta do zip + XML
* o `Type` de relacionamento correto é `http://schemas.microsoft.com/office/2017/06/relationships/sheetMetadata`
* o `ContentType` correto é `application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml`
* o uri da extensão `dynamicArrayProperties` é fixo: `{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}`
* a função detecta a aba `listas` por conteúdo (procura por `_xlfn` + `FILTER` em A2/C2/E2 nos `xl/worksheets/sheetN.xml`), evitando dependência de ordem fixa dos sheets
* se o pipeline gerar arquivos onde a `listas` não tenha as 3 fórmulas, a função sai sem alterar nada — não é um erro

### CalcFeatures (obrigatório para destravar o spill sem `@`)

Sintoma: mesmo com `xl/metadata.xml` + `cm="1"` + `Override` em `[Content_Types].xml` + `Relationship` em `xl/_rels/workbook.xml.rels` todos corretos, o Excel 365 ainda assim insere o operador de interseção implícita (`@`) antes de `IFERROR`, `LET`, `SORT` etc. ao abrir o arquivo. O analista vê algo como:

```
A2: =@IFERROR(SORT(UNIQUE(FILTER(...))))
C2: =IFERROR(@LET(...))
E2: =IFERROR(@LET(...))
```

Com o `@`, `F2 + Enter` não destrava o spill: o analista precisa **editar a célula e remover manualmente o `@`** antes de pressionar Enter.

**Causa raiz:** o `xl/workbook.xml` não declara `<extLst>` com `<xcalcf:calcFeatures>`. Sem essa declaração, o Excel trata o workbook como **legacy** (pre-DA) e ignora a metadata `XLDAPR`, mesmo ela estando corretamente registrada no zip. As features críticas são `microsoft.com:RD` (Reduce/Dynamic) e `microsoft.com:LET_WF` (LET).

**Fix:** a função `apply_workbook_calc_features(xlsx_path)` em `gerar_excel_contabil.py` injeta o `<extLst>` correto em `xl/workbook.xml` imediatamente antes de `</workbook>`. Conteúdo canonico inserido:

```xml
<extLst>
  <ext uri="{B58B0392-4F1F-4190-BB64-5DF3571DCE5F}"
       xmlns:xcalcf="http://schemas.microsoft.com/office/spreadsheetml/2018/calcfeatures">
    <xcalcf:calcFeatures>
      <xcalcf:feature name="microsoft.com:RD"/>
      <xcalcf:feature name="microsoft.com:Single"/>
      <xcalcf:feature name="microsoft.com:FV"/>
      <xcalcf:feature name="microsoft.com:CNMTM"/>
      <xcalcf:feature name="microsoft.com:LET_WF"/>
      <xcalcf:feature name="microsoft.com:LAMBDA_WF"/>
      <xcalcf:feature name="microsoft.com:ARRAYTEXT_WF"/>
    </xcalcf:calcFeatures>
  </ext>
</extLst>
```

Regras:

* sempre chamar `apply_workbook_calc_features(output_path)` **depois** de `apply_dynamic_array_metadata(output_path)` em `main()`; ambos são pós-processamentos do zip e a ordem entre eles é indiferente, mas ambos têm que rodar **após** `wb.save`
* a função é idempotente: detecta `calcFeatures` no `workbook.xml` e não duplica
* a uri `{B58B0392-4F1F-4190-BB64-5DF3571DCE5F}` e o namespace `xcalcf` são fixos: não alterar
* `microsoft.com:RD` é a feature decisiva; as outras são defensivas (algumas builds verificam `LET_WF` separadamente)
* sem essa função, o arquivo **abre com `@`** e o analista precisa remover manualmente em A2/C2/E2; com a função, o spill ocorre automaticamente na abertura

### Comportamento esperado ao abrir o arquivo

Com `apply_listas_formulas` + `apply_dynamic_array_metadata` + `apply_workbook_calc_features` aplicados, o Excel 365 ao abrir o xlsx:

* posiciona o cursor em `Listas!A2` (ver bloco de active sheet/selection abaixo)
* avalia A2/C2/E2 como dynamic arrays e faz **spill automático** para baixo
* **não injeta `@`** em nenhuma das fórmulas
* exibe na barra de fórmulas: `=IFERROR(SORT(UNIQUE(FILTER(Rastreabilidade!$K$2:$K$1048576;Rastreabilidade!$K$2:$K$1048576<>"")));"")` (separador `;` por causa do locale PT-BR; prefixos `_xlfn.` ocultos)

O bloco de configuração de active sheet/selection abaixo continua sendo aplicado para garantir que o analista veja imediatamente o resultado, mas não é mais necessário como workaround para o `@` (que não aparece mais).

```python
listas_index = wb.sheetnames.index(listas_ws.title)
wb.active = listas_index
for ws in wb.worksheets:
    ws.sheet_view.tabSelected = (ws.title == listas_ws.title)
sel = listas_ws.sheet_view.selection[0]
sel.activeCell = "A2"
sel.sqref = "A2"
```

Espaço reservado para instruções ao analista:

* `apply_listas_formulas` limpa apenas as colunas A, C, E a partir da linha 3 — as colunas **B, D, F estão livres** e preservadas entre execuções (não são tocadas por nenhuma rotina do pipeline)
* o template pode conter texto de instrução em `B2`, `D2`, `F2` (ou em qualquer linha de B/D/F); esse conteúdo será mantido em todos os outputs
* nunca colocar instruções em A3+, C3+ ou E3+ — `apply_listas_formulas` zera essas células e o spill da fórmula em A2/C2/E2 sobrescreveria qualquer conteúdo deixado lá

### Capitalização dos nomes das sheets canônicas

O Excel exibe referências de fórmula sempre com o **nome real** da sheet (case-preserving), independentemente do case com que a referência foi escrita na string da fórmula. Como as fórmulas em `Listas!A2/C2/E2` são gravadas com nomes capitalizados (`Rastreabilidade!`, `Shadow!`), as próprias sheets precisam ter nomes capitalizados, senão o display fica `rastreabilidade!`/`shadow!` na barra de fórmulas.

A função `normalize_sheet_names(wb)` em `gerar_excel_contabil.py` é chamada antes de `wb.save(output_path)` e renomeia as sheets canônicas:

| Lower (template) | Capitalizada (output) |
|---|---|
| `shadow` | `Shadow` |
| `rastreabilidade` | `Rastreabilidade` |
| `listas` | `Listas` |

Implementação em **2 etapas** (necessária por causa de quirk do `openpyxl`):

```python
SHEET_NAME_NORMALIZATIONS = {
    "shadow": "Shadow",
    "rastreabilidade": "Rastreabilidade",
    "listas": "Listas",
}

def normalize_sheet_names(wb) -> None:
    pending: dict[str, str] = {}
    for ws in wb.worksheets:
        target = SHEET_NAME_NORMALIZATIONS.get(ws.title.lower())
        if target and ws.title != target:
            tmp = f"__norm_tmp__{ws.title}__"
            ws.title = tmp
            pending[tmp] = target
    for tmp, final in pending.items():
        wb[tmp].title = final
```

Por que 2 etapas: `openpyxl` considera nomes de sheet **case-insensitive** ao verificar colisões. Tentar `ws.title = "Shadow"` quando já existe (a própria sheet) `"shadow"` faz a biblioteca interpretar como conflito e adicionar sufixo numérico (`Shadow1`). A solução é renomear primeiro para um nome único temporário e depois para o final.

Regras:

* sempre chamar `normalize_sheet_names(wb)` **antes** de `wb.save(output_path)` e **antes** do bloco que define `wb.active = listas_index` (esse bloco já lê `listas_ws.title`, que após normalização é `"Listas"`)
* não tentar renomear via `ws.title = target` em uma única chamada — bug do openpyxl com colisão case-insensitive consigo mesmo
* a resolução de referências a sheets em fórmulas é **case-insensitive em Excel**, então fórmulas pré-existentes em outras células do template que usem a forma minúscula continuam funcionando após a normalização (Excel apenas atualiza o display para o novo case)
* `apply_dynamic_array_metadata` detecta a aba `listas` por conteúdo (procurando `_xlfn` + `FILTER` em A2/C2/E2), não por nome, portanto continua funcionando após a normalização
* `verify_shadow_integrity` é chamado com `shadow_ws.title` que após normalização é `"Shadow"`; o lookup `wb_check[shadow_sheet_name]` funciona normalmente

### Validações da Shadow

As validações de dados das áreas manuais da Shadow devem ser reaplicadas via Python sem alterar o conteúdo das células protegidas.

Faixas de validação:

* Retirar Ativo: `J5:M39`
* Adicionar Ativo: `N5:Q39`
* Retirar Passivo: `J45:M79`
* Adicionar Passivo: `N45:Q79`
* Retirar DRE: `AC5:AF39`
* Adicionar DRE: `AG5:AJ39`

Regras:

* nunca limpar conteúdo dessas faixas
* nunca sobrescrever entradas manuais existentes
* apenas reaplicar validações e preservar o conteúdo original

### Pós-processamento obrigatório das validações

Após qualquer geração do Excel final, mesmo que `gerar_excel_contabil.py` tenha sido executado, executar obrigatoriamente o script utilitário `aplicar_validacoes.py` sobre o arquivo de saída, como última etapa antes de entregar:

```bash
python aplicar_validacoes.py <caminho_do_xlsx_gerado>
```

Regras:

* este passo é idempotente e seguro; remove apenas validações das 6 faixas alvo e as re-aplica com a fórmula canônica
* nunca alterar valores de células; apenas registrar validações
* se o script sair com erro, o arquivo não deve ser entregue — reprocessar
* as 6 validações obrigatórias são:

  * `J5:M39` → `listas!$E$2:$E$1048576`
  * `J45:M79` → `listas!$E$2:$E$1048576`
  * `AC5:AF39` → `listas!$E$2:$E$1048576`
  * `N5:Q39` → `listas!$C$2:$C$1048576`
  * `N45:Q79` → `listas!$C$2:$C$1048576`
  * `AG5:AJ39` → `listas!$C$2:$C$1048576`

Observações técnicas para implementação via openpyxl:

* `DataValidation(type="list", formula1=..., allow_blank=True, showDropDown=False)`
* `formula1` **nunca** deve começar com `=` — openpyxl grava o conteúdo literalmente em `<formula1>` e o Excel descarta validações com `==` no XML
* `showDropDown=False` mantém a seta visível (no OOXML, `True` esconde a seta)
* aplicar sempre `shadow_ws.add_data_validation(dv)` seguido de `dv.add(cell_range)`

---

## 19. Regras de fórmulas e propagação

Quando a aba `Rastreabilidade` possuir colunas calculadas:

* propagar fórmulas das linhas anteriores para as novas linhas
* preservar estilo, formato numérico, proteção e alinhamento quando aplicável
* não sobrescrever valores já escritos manualmente
* se existirem colunas `Chave` e `Chave Destino`, validar suas fórmulas em todas as novas linhas

Se houver fórmulas auxiliares necessárias na aba `Listas`, elas devem:

* referenciar a `Rastreabilidade`
* respeitar estabilidade operacional
* ser escritas em sintaxe interna do Excel
* evitar lógica ambígua por nome isolado de destino quando houver homônimos

---

## 20. Regras de integridade do template

Antes de salvar:

* garantir que o template original foi usado como base
* garantir que nenhuma aba foi recriada
* garantir que nenhuma aba foi reordenada
* garantir que nomes definidos, fórmulas e estrutura foram preservados
* garantir que macros foram preservadas, se o arquivo for `.xlsm`
* garantir que o workbook foi marcado para recálculo completo ao abrir
* garantir que as áreas protegidas da Shadow não foram alteradas indevidamente

---

## 21. Validação obrigatória

Antes de entregar:

* validar no Excel gerado se Ativo = Passivo + PL
* revisar alocação dupla
* revisar troca indevida de grupo
* revisar julgamentais, “Outros” e subcategorias
* comparar documento original x Excel gerado
* validar se as validações da `Shadow` foram reaplicadas corretamente
* validar se fórmulas da `Rastreabilidade` foram propagadas
* validar se a coluna `Chave` foi preenchida corretamente
* validar se a coluna `Chave Destino` foi preenchida corretamente
* validar se a aba `Listas` foi materializada corretamente quando fórmulas dinâmicas não forem confiáveis
* validar se todo `Destino no Template` pertence ao `Grupo` e à `Sub Categoria` corretos
* validar se nenhuma linha da Shadow recebeu memória de grupo incompatível
* validar se nenhuma conta homônima compartilhou memória entre grupos distintos
* validar se nenhuma agregação foi feita usando apenas o nome do destino
* validar se nenhuma conta foi alocada em linha bloqueada por total
* validar se nenhuma linha bloqueada recebeu escrita automática em `H` ou `Z`
* validar se `I` e `AA` permaneceram sem escrita automática
* validar se `AB` permaneceu intocado
* validar se contas classificadas como DRE ficaram com `Sub Categoria = DRE`
* validar se as contas abaixo ficaram com `Grupo = Passivo` e `Sub Categoria = PL`:

  * `PARTICIPAÇÕES MINORITÁRIAS`
  * `Capital Social`
  * `Lucros Acumulados`
  * `Outras Reservas`
* validar que, se houver múltiplas abas Shadow válidas, a aba utilizada foi escolhida explicitamente pelo usuário

### Validações específicas para homônimos

Se o template contiver destinos com o mesmo nome em mais de um grupo ou subcategoria:

* tratar obrigatoriamente essas linhas como destinos distintos
* validar que a memória foi montada por chave estrutural
* validar que nenhuma linha recebeu itens de outro grupo
* validar que nenhuma linha de Ativo/Passivo recebeu subcategoria incompatível
* registrar erro se houver qualquer contaminação cruzada

---

## 22. Rastreabilidade e escopo

A `Rastreabilidade` deve refletir apenas as contas extraídas do documento principal analisado e dentro do escopo aprovado pelo usuário.

Regras:

* não incluir contas fora do modelo aprovado
* não incluir páginas fora do conjunto aprovado
* não incluir anos fora do exercício/período aprovado
* não importar contas do Excel adicional
* não incluir totais, subtotais, cabeçalhos ou linhas decorativas

---

## 23. Parecer final

Após gerar o arquivo, apresentar:

* arquivo analisado
* quantidade de contas capturadas
* períodos identificados
* tipos de demonstrativo encontrados
* quantidade por tipo de mapeamento
* contas julgamentais para revisão
* cobertura de valores (matriz `cobertura_valores`: Sim/Não × com/sem valor) e, se houver, contas **alocadas com valor zero** (`sim_alocadas_zeradas`) e sugestões de **consolidação de totalizador** do parecer
* nome do arquivo gerado (padrão `OUTPUT_NAME_PATTERN`, ver §28)
* parecer contábil resumido com:

  * pontos de atenção
  * riscos de classificação
  * equilíbrio patrimonial
  * itens para revisão humana

**Redação do fechamento:** anunciar a conclusão **somente após o arquivo estar realmente gerado** (não antes, com o arquivo ainda carregando). Escrever em português correto — ex.: "Gerei o arquivo…" / "Arquivo gerado:" (**nunca** "Gereei"). Não afirmar que gerou enquanto o arquivo não foi produzido.

---

## 24. Regra de fail-fast

A execução deve falhar explicitamente, com mensagem de erro clara, quando ocorrer qualquer uma das situações abaixo:

* ausência de aba obrigatória
* Shadow inválida
* coluna obrigatória ausente na `Rastreabilidade`
* incompatibilidade estrutural entre origem e destino
* tentativa de agregação por nome isolado em cenário com homônimos
* memória incompatível com o grupo da linha
* memória incompatível com a subcategoria da linha
* alteração indevida de área protegida
* falha na reaplicação de validações obrigatórias
* ausência de chave estrutural em etapas críticas de consolidação interna
* tentativa de alocação em linha totalizadora bloqueada
* múltiplas abas Shadow válidas sem escolha explícita do usuário
* conta classificada como DRE sem `Sub Categoria = DRE`
* conta de PL específica classificada fora de `Grupo = Passivo` e `Sub Categoria = PL`

---

## 25. Regra de implementação recomendada

Toda implementação Python deve preferir as seguintes chaves e controles:

### Chave da origem

`Origem|Grupo|Sub Categoria`

### Chave estrutural do destino

`Destino no Template|Grupo|Sub Categoria`

### Uso recomendado

* matching de memória anterior
* agrupamento de novas origens
* atualização da Shadow
* validação de homônimos
* auditoria interna
* QA final

Essas chaves devem ser tratadas como base obrigatória quando houver qualquer possibilidade de colisão por nome.

---

## 26. Princípio final

Em caso de dúvida:

* preservar a estrutura contábil
* não misturar grupos
* não misturar subcategorias
* não usar apenas o nome da conta destino
* não usar linha totalizadora como destino
* priorizar consistência estrutural sobre conveniência operacional
* rejeitar alocação ou memória ambígua em vez de aceitar mistura indevida



---

## 27. Regra complementar para arquivo Excel de memória anterior no novo layout

Quando o usuário importar um arquivo Excel adicional para uso como memória anterior, a identificação da aba válida não deve mais usar `A1 = "Shadow Empresa:"`.

### 27.1. Identificação da aba válida
A aba deve ser considerada válida apenas quando atender simultaneamente:
- `A1 = "CNPJ:"`
- `A2 = "EMPRESA:"`
- `A3 = "GRUPO:"`
- `A4 = "AUDITADO:"`
- `A5 = "CONSOLIDADO:"`

Observação:
- em `A3`, ignorar diferenças de espaços à esquerda e à direita; o texto-base obrigatório continua sendo `GRUPO:`

### 27.2. Nome da empresa a exibir ao usuário
Quando houver mais de uma aba válida:
- capturar o nome da empresa em `B2`
- listar as opções rotuladas com LETRAS (A, B, C...)
- permitir escolha pela letra ou pelo nome
- nunca escolher automaticamente quando houver mais de uma opção válida

### 27.3. Faixas da memória anterior no novo layout
Para leitura da memória anterior, usar as seguintes faixas:

#### Ativos
- Contas: `A12:A50`
- Colunas candidatas de memória: `B12:G50` e `I12:J50`
- Linha de cabeçalho para ano/período: `11`

#### Passivos
- Contas: `A52:A90`
- Colunas candidatas de memória: `B52:G90` e `I52:J90`
- Linha de cabeçalho para ano/período: `51`

#### DRE
- Contas: `AB12:AB49`
- Colunas candidatas de memória: `AC12:AH49` e `AJ12:AK49`
- Linha de cabeçalho para ano/período: `11`

### 27.4. Regra de escolha da coluna de memória anterior
Em cada bloco (Ativo, Passivo e DRE), a coluna de memória anterior usada no matching deve ser escolhida assim:
1. considerar apenas colunas candidatas com conteúdo textual não vazio
2. priorizar a coluna com maior quantidade de células preenchidas
3. em caso de empate, priorizar a coluna com o ano mais recente identificado no cabeçalho
4. persistindo empate, priorizar a coluna mais à direita

### 27.5. Regras de uso
- essa memória anterior serve apenas para matching histórico
- ela não substitui a regra de atualização da `Memoria Atual` no template final
- a atualização automática continua ocorrendo apenas em `H` e `Z` do template principal
- toda memória continua segregada por `Destino no Template | Grupo | Sub Categoria`

---

## 28. Nome padronizado do arquivo de saída

O arquivo final deve ter nome padronizado (não aleatório), gerado pela variável **editável** `OUTPUT_NAME_PATTERN` em `gerar_excel_contabil.py`:

`{empresa}_{cnpj}_Output_{data}_ALLOCATOR_{ano}`

Campos:
- `{empresa}`: nome da empresa **localizado no documento analisado** (sanitizado: sem acentos, espaços ou caracteres ilegais)
- `{cnpj}`: CNPJ localizado no documento (apenas dígitos)
- `{data}`: data de hoje em `ddMMAAAA`
- `{ano}`: **maior (mais recente)** ano reconhecido; havendo mais de um período, considerar o maior
- extensão `.xlsx`/`.xlsm` anexada conforme o template

Exemplo: `AcmeLtda_12345678000190_Output_01062026_ALLOCATOR_2025.xlsx`

Operação:
- localizar nome e CNPJ no próprio documento (capa/cabeçalho/rodapé/balancete); se houver Shadow no Excel adicional, o nome está em `B2`
- invocar `gerar_excel_contabil.py` com `--company-name "<nome>"` e `--cnpj "<cnpj>"` (ou `--auto-name`); o nome é montado mantendo a pasta de `--output`
- se nome ou CNPJ não forem localizados, usar os fallbacks `Empresa`/`SemCNPJ` e sinalizar no parecer para revisão
- para mudar a convenção, **editar apenas** `OUTPUT_NAME_PATTERN` (fonte única; não espalhar o padrão pelo código)

---

## 29. Abas internas do arquivo final (`rastreabilidade_inicial` e `Base de dados`)

O `gerar_excel_contabil.py` adiciona **duas abas** ao arquivo final, ambas **ocultas e protegidas por senha** (anti-edição). As **demais abas** (`Shadow`, `Rastreabilidade`, `Listas`) **continuam visíveis e editáveis** — a proteção é aplicada **por planilha**, sem trava de estrutura do workbook (você segue podendo adicionar/remover/editar as outras abas normalmente).

### 29.1. `rastreabilidade_inicial`
- Cópia **congelada** da `Rastreabilidade`, criada **depois** de ela estar 100% preenchida — serve de **referência/espelho** para depois detectar quais contas mudaram.
- Sai com `sheet_state = "hidden"`: você consegue dar **"Reexibir"** para inspecionar, mas **não editar** sem a senha. Para escondê-la até do menu Reexibir, trocar a constante `LOCK_SHEET_STATE` para `"veryHidden"`.

### 29.2. `Base de dados`
- A aba **já existe no template** (substitui a antiga `config`): layout em **colunas**, com **cabeçalhos na linha 1** e o valor correspondente na **linha 2** (um registro por arquivo). O script **preenche a linha 2 casando cada campo pelo NOME do cabeçalho** (preserva os cabeçalhos/formatação do template e é robusto a reordenação) e **não recria** a aba. Também sai oculta + protegida.
- Campos preenchidos pelo script (casados por cabeçalho): `Versão do GPT`, `Modelo do arquivo`, `Formato Auditado`, `Unidade de medida`, `Moeda`, `Modificação base de Valores`, `Páginas do input`, `Páginas de referência (BP+DRE)`, `Nível de complexidade de alocação e planilhamento`, `Tempo de Início (GPT)`, `Tempo Final (GPT)`, `Empresa`, `CNPJ`, `Anos identificados`, `Data/hora de geração`, `Arquivo gerado`.
- A aba pode ter **colunas adicionais** (ex.: `Matrícula do usuário`, `Grupo`, `Segmento`, `# periodos`, `periodo 1/2/3`, `# de alterações na rastreabilidade/shadow`) que o script **não** preenche — ficam vazias para preenchimento manual/posterior. Como a aba sai **protegida**, edite-as via **Reexibir + Desproteger** (senha `LOCK_PASSWORD`) quando necessário.
- `Formato Auditado` = `Sim`/`Não`: a GPT identifica se o documento de **input** é auditado (parecer/relatório dos auditores independentes, notas explicativas formais, assinatura de auditor). Vem de `--formato-auditado`.
- `Unidade de medida` = **somente** `Mil`, `MM` ou `Bi` (o script normaliza variantes: "Milhares"→`Mil`, "Milhões"→`MM`, "Bilhões"→`Bi`). Vem de `--unidade-medida`.
- `Modificação base de Valores` = `Não` (não houve), `x1.000` (multiplicou) ou `/1.000` (dividiu) — reflete a conversão aplicada na pergunta de unidade/moeda (§5.2). Vem de `--modificacao-valores`; default `Não`.
- `Nível de complexidade de alocação e planilhamento` = `Baixo`/`Médio`/`Alto`: avaliação da GPT sobre a dificuldade da leitura/alocação/planilhamento do arquivo. Vem de `--complexidade`.
- `Tempo de Início (GPT)` = horário em que o usuário fez o **upload** do arquivo; `Tempo Final (GPT)` = horário em que a GPT **disponibilizou o arquivo** no chat (se omitido, o script usa o instante de geração). Ver §29.3.
- `Páginas de referência (BP+DRE)` = quantidade de páginas DISTINTAS que de fato trouxeram dados (origens do OCR). Se a GPT não passar `--paginas-referencia`, o script conta sozinho a partir das páginas das origens.
- `Versão do GPT` vem de `--versao-gpt` (default `v1.06`; constante `VERSAO_GPT` no script).
- `Moeda` vem da resposta confirmada no chat (`--moeda`).

### 29.3. O que a CustomGPT precisa passar
Modelo, nº de páginas, auditoria, complexidade e os horários **não** são conhecidos pelo script — a GPT os fornece ao invocar `gerar_excel_contabil.py`:
- `--modelo "Consolidado"` (ou Saldo Anterior etc., conforme confirmado no chat)
- `--paginas-input 42`
- `--versao-gpt "v1.06"` (versão do GPT/knowledge; default `v1.06`)
- `--unidade-medida "Mil"` (**somente** Mil/MM/Bi, conforme confirmado no chat; o script normaliza variantes)
- `--moeda "BRL"` (BRL/US/EUR, conforme confirmado no chat)
- `--modificacao-valores "Não"` (ou `x1.000` / `/1.000`, conforme a conversão aplicada em §5.2; default `Não`)
- `--formato-auditado "Sim"` (ou `Não`; a GPT identifica se o **input** é auditado)
- `--complexidade "Médio"` (Baixo/Médio/Alto; a GPT avalia a dificuldade da alocação/planilhamento)
- `--paginas-referencia 5` (opcional; nº de páginas que de fato trouxeram BP+DRE; se omitido, o script conta as páginas distintas das origens)
- **Horários (início = upload; fim = entrega):**
  - **No passo 1** (ao receber o input), gravar o horário do **upload** num **marcador em disco** (sobrevive a reinício de kernel entre turnos):
    ```python
    from datetime import datetime
    from pathlib import Path
    Path("/mnt/data/_allocator_start.txt").write_text(datetime.now().isoformat(timespec="seconds"), encoding="utf-8")
    ```
  - **Ao gerar o output**, passar `--start-time-file "/mnt/data/_allocator_start.txt"` (ou `--tempo-inicio-gpt "2026-06-17T09:40:00"` direto) → vira **Tempo de Início (GPT)**.
  - **Tempo Final (GPT)**: passar `--tempo-final-gpt` com o horário de entrega; se omitido, o script usa o **instante de geração** (ótimo proxy, pois a entrega ocorre segundos depois).
- `--lock-password "<senha>"` (opcional; vazio usa `LOCK_PASSWORD` do script)

Os campos automáticos (Empresa, CNPJ, Anos, Data/hora de geração, Arquivo gerado) são preenchidos sozinhos.

### 29.4. Senha e limites
- Senha **editável**: constante `LOCK_PASSWORD` no script ou via `--lock-password`. Nível de ocultação editável via `LOCK_SHEET_STATE` (`hidden`/`veryHidden`).
- **A proteção do Excel não é criptografia**: impede edição acidental, mas é removível por usuário determinado (descompactando o `.xlsx`). Senha para **abrir** o arquivo (criptografia AES) **não** é gerável pelo script.
- A **comparação automática** (`rastreabilidade_inicial` × `Rastreabilidade`, listando contas alteradas) **ainda não está implementada** — pode ser adicionada como próximo passo.

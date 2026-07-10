# -*- coding: utf-8 -*-
"""Golden dataset: fleury.pdf (ITR 31/03/2026, KPMG) — visão CONSOLIDADO.

Transcrito manualmente das páginas 6 (BP) e 7 (DRE). Valores em R$ mil.
BP compara 31/03/2026 x 31/12/2025; DRE compara 31/03/2026 x 31/03/2025.
Linhas de total entram no gabarito como conferência (a ferramenta captura
totais como contexto — o eval só exige que, SE capturados, os valores batam).
"""

# (origem, grupo, v_31_03_2026, v_comparativo)  [comparativo: BP=31/12/2025, DRE=31/03/2025]
BP = [
    ("Caixa e equivalentes de caixa", "Ativo", 9720, 21772),
    ("Títulos e valores mobiliários", "Ativo", 2140485, 2140619),
    ("Contas a receber", "Ativo", 2005869, 1747166),
    ("Estoques", "Ativo", 150818, 180702),
    ("Impostos a recuperar", "Ativo", 219883, 248153),
    ("Outros ativos", "Ativo", 123563, 83053),
    ("Total circulante", "Ativo", 4650338, 4421465),
    # realizável a longo prazo (homônimos do circulante!)
    ("Títulos e valores mobiliários", "Ativo", 116348, 112622),
    ("Impostos a recuperar", "Ativo", 9635, 9945),
    ("Imposto de renda e contribuição social diferidos", "Ativo", 8430, 11058),
    ("Depósitos judiciais", "Ativo", 23546, 19488),
    ("Contas a receber", "Ativo", 7242, 9532),
    ("Outros ativos", "Ativo", 64134, 67116),
    ("Total do realizável a longo prazo", "Ativo", 229335, 229761),
    ("Investimentos", "Ativo", 105850, 111772),
    ("Imobilizado", "Ativo", 1355204, 1379255),
    ("Intangível", "Ativo", 5905506, 5979637),
    ("Direito de uso", "Ativo", 1079421, 1098591),
    ("Total não circulante", "Ativo", 8675316, 8799016),
    ("Total do ativo", "Ativo", 13325654, 13220481),
    ("Fornecedores", "Passivo", 733299, 800133),
    ("Financiamentos", "Passivo", 10818, 17358),
    ("Debêntures", "Passivo", 328970, 214745),
    ("Arrendamento", "Passivo", 308319, 318732),
    ("Obrigações trabalhistas", "Passivo", 345296, 407632),
    ("Obrigações e parcelamentos tributários", "Passivo", 76505, 59250),
    ("IRPJ e CSLL a recolher", "Passivo", 12743, 38280),
    ("Contas a pagar - aquisições de empresas", "Passivo", 43467, 79339),
    ("Juros sobre capital próprio e dividendos a pagar", "Passivo", 293863, 291836),
    ("Outros passivos", "Passivo", 22476, 18375),
    ("Total circulante", "Passivo", 2175756, 2245680),
    # não circulante (homônimos!)
    ("Financiamentos", "Passivo", 701, 892),
    ("Debêntures", "Passivo", 3797664, 3797474),
    ("Arrendamento", "Passivo", 910562, 922242),
    ("Imposto de renda e contribuição social diferidos", "Passivo", 555293, 557540),
    ("Provisão para riscos tributários, trabalhistas e cíveis", "Passivo", 174320, 180504),
    ("Obrigações tributárias", "Passivo", 850, 850),
    ("Contas a pagar - aquisições de empresas", "Passivo", 361874, 348031),
    ("Dividendos a pagar", "Passivo", 71000, 71000),
    ("Total não circulante", "Passivo", 5872264, 5878533),
    ("Capital social", "Passivo", 2736029, 2736029),
    ("Reserva de capital", "Passivo", 1915603, 1915603),
    ("Reservas de lucro", "Passivo", 332450, 332450),
    ("Ações em tesouraria", "Passivo", -55497, -35559),
    ("Ajustes de avaliação patrimonial", "Passivo", 52817, 52817),
    ("Lucro do período", "Passivo", 201212, None),
    ("Patrimônio líquido dos controladores", "Passivo", 5182614, 5001340),
    ("Participação de não controladores", "Passivo", 95020, 94928),
    ("Total do patrimônio líquido", "Passivo", 5277634, 5096268),
    ("Total do passivo e patrimônio líquido", "Passivo", 13325654, 13220481),
]

DRE = [
    ("Receita de prestação de serviços", "DRE", 2223118, 2015073),
    ("Custo dos serviços prestados", "DRE", -1595052, -1442955),
    ("Lucro Bruto", "DRE", 628066, 572118),
    ("Gerais e administrativas", "DRE", -208138, -196264),
    ("Despesas comerciais", "DRE", -46353, -41781),
    ("Outras receitas (despesas) operacionais, líquidas", "DRE", -700, 1411),
    ("Equivalência patrimonial e realização de valor justo", "DRE", -5062, -2271),
    ("Lucro operacional antes do resultado financeiro", "DRE", 367813, 333213),
    ("Receitas financeiras", "DRE", 80815, 79100),
    ("Despesas financeiras", "DRE", -195875, -182470),
    ("Resultado financeiro", "DRE", -115060, -103370),
    ("Lucro antes do imposto de renda e da contribuição social", "DRE", 252753, 229843),
    ("Corrente", "DRE", -54705, -46840),
    ("Diferido", "DRE", -395, -7173),
    ("Lucro líquido do período", "DRE", 197653, 175830),
]

# Contas que NÃO devem aparecer (fora do Consolidado ou fora de BP/DRE)
NAO_DEVE_TER = [
    "Dividendos a receber - Hermes Pardini",   # só existe na Controladora ("-" no Consolidado)
    "Depreciação e amortização do custo",       # DFC/notas
    "Aumento de capital",                       # DMPL
    "Impostos, taxas e contribuições",          # DVA
]

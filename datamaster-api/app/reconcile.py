"""
Reconciliação DETERMINÍSTICA dos valores extraídos por LLM.

Por que existe: o LLM é confiável para JULGAMENTO (classificação, hierarquia,
"isTotal"...) mas NÃO para tarefas de contagem/posição exata — "qual token
vai em qual coluna quando há um traço no meio da linha" é precisamente o
tipo de tarefa em que modelos de linguagem erram, mesmo com instrução
reforçada no prompt (foi a causa raiz do balanço não fechar no caso real
que motivou este módulo). A leitura de NÚMEROS não pode depender de "quase
certo" — reclassificar contas é julgamento humano revisável; ler um valor
do documento é fato, e aqui vira parser determinístico (regex + contagem
de posição), o mesmo algoritmo já validado no import client-side do portal
(buildRowsPositional em datamaster-portal/src/import/mapping.js).

Estratégia: depois que o LLM devolve as linhas de uma página (origem,
hierarquia, grupo, isTotal...), este módulo relê a linha ORIGINAL do texto
da página para cada origem e recalcula os valores por POSIÇÃO — SOBRESCREVE
os valores do LLM quando consegue tokenizar com confiança. O LLM nunca é a
fonte de verdade para números; só para julgamento.
"""
from __future__ import annotations

import re
import unicodedata

_VALUE_RE = re.compile(
    r"^\(?-?(?:r\$)?\s*\d{1,3}(?:\.\d{3})*(?:,\d+)?\)?$", re.IGNORECASE,
)
_DASH_RE = re.compile(r"^[-–—]$")  # "-", en dash, em dash


# Travessões/hifens tipográficos, aspas curvas e espaços especiais que o
# LLM costuma "normalizar" ao transcrever (ex.: "–" do documento vira "-"
# na saída do modelo) — sem isso, o comparador de texto falha e a linha
# "não é encontrada", desligando a reconciliação justo onde ela mais
# importa. Bug real: "Dividendos a receber – Hermes Pardini" (en-dash no
# PDF) não batia com a mesma origem transcrita com hífen comum pelo LLM.
_PONTUACAO_VARIANTE = str.maketrans({
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
    "―": "-", "−": "-",
    "‘": "'", "’": "'", "“": '"', "”": '"',
    " ": " ", " ": " ", "​": "",
})


def _norm(s: str) -> str:
    s = str(s or "").strip().lower().translate(_PONTUACAO_VARIANTE)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def _is_value_token(tok: str) -> bool:
    t = tok.strip()
    if _DASH_RE.match(t):
        return True
    return bool(_VALUE_RE.match(t.replace(" ", "")))


def _to_number(tok: str) -> float | None:
    t = tok.strip()
    if _DASH_RE.match(t):
        return None
    neg = False
    if t.startswith("(") and t.endswith(")"):
        neg = True
        t = t[1:-1]
    t = re.sub(r"(?i)r\$", "", t).strip()
    if t.startswith("-"):
        neg = True
        t = t[1:]
    if "," in t and "." in t:
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")  # BR: ponto=milhar, virgula=decimal
        else:
            t = t.replace(",", "")  # US: virgula=milhar
    elif "," in t:
        t = t.replace(",", ".")
    elif re.match(r"^\d{1,3}(\.\d{3})+$", t):
        t = t.replace(".", "")  # ponto como separador de milhar PT-BR
    try:
        n = float(t)
    except ValueError:
        return None
    return -n if neg else n


def _find_subsequence(tokens: list[str], sub: list[str], start: int) -> int | None:
    """Índice da primeira ocorrência de `sub` (normalizada) dentro de
    `tokens`, buscando a partir de `start`. None se não encontrar."""
    sub_n = [_norm(s) for s in sub]
    if not sub_n:
        return None
    limit = len(tokens) - len(sub_n)
    for i in range(start, limit + 1):
        if all(_norm(tokens[i + j]) == sub_n[j] for j in range(len(sub_n))):
            return i
    return None


_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")


def detect_column_order(page_text: str, visoes: list[str], periodos: list[str]) -> list[str] | None:
    """Lê a ordem REAL das colunas direto do CABEÇALHO da página, em vez de
    confiar na ordem da lista global de períodos (que intercala BP/DRE e
    pode não bater com a ordem de UMA página específica — foi a causa de
    valores de Consolidado saírem trocados com Controladora na DRE).

    Padrão típico (2+ visões lado a lado): uma linha com os nomes das
    visões ("Controladora Consolidado") seguida, em até 3 linhas, por uma
    linha com as datas — o bloco de datas é dividido em partes iguais,
    uma por visão, na MESMA ordem em que os nomes apareceram. Retorna None
    se o padrão não for reconhecido (chamador usa um fallback).
    """
    if not visoes or len(visoes) < 2:
        return None
    lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
    for i, ln in enumerate(lines[:15]):  # cabeçalho fica no topo da página
        achadas = [v for v in visoes if re.search(rf"(?<!\S){re.escape(v)}(?!\S)", ln)]
        if len(achadas) < 2:
            continue
        for j in range(i, min(i + 3, len(lines))):
            datas = _DATE_RE.findall(lines[j])
            if len(datas) < len(achadas) or len(datas) % len(achadas) != 0:
                continue
            k = len(datas) // len(achadas)
            order: list[str] = []
            for vi, v in enumerate(achadas):
                for d in datas[vi * k: (vi + 1) * k]:
                    rotulo = next((p for p in periodos if v in p and d in p), f"{v} {d}")
                    order.append(rotulo)
            if len(order) == len(datas):
                return order
    return None


def reconcile_page(page_text: str, rows: list[dict], column_order: list[str]) -> list[str]:
    """Sobrescreve `row["valores"]` de cada linha com o parser posicional
    determinístico, quando a origem for localizada no texto e os N valores
    seguintes forem tokenizados com confiança. Muta `rows` in-place.
    Retorna a lista de avisos (origens não reconciliadas — nelas os valores
    do LLM foram mantidos, sem garantia).

    Dois formatos de PDF coexistem na prática (o mesmo documento pode ter
    os dois em páginas diferentes): (a) rótulo + valores todos na MESMA
    linha; (b) rótulo espalhado por 1-2 linhas e CADA valor em sua própria
    linha (comum em relatórios anuais completos, diferente do ITR
    trimestral). A busca do rótulo usa um fluxo CONTÍNUO de tokens (ignora
    onde o PDF quebrou linha, então acha rótulos que atravessam linhas);
    mas para decidir ONDE terminam os valores, usamos uma pista estrutural
    confiável em vez de tentar adivinhar pelo formato do número: qualquer
    token que ainda esteja na MESMA LINHA do fim do rótulo é código/Nota
    (nunca valor) — nesses documentos um valor real nunca fica colado ao
    rótulo quando o restante da tabela usa "um valor por linha". Isso evita
    confundir Nota "26" com um valor real de mesmo formato (ambos parecem
    um número pequeno — o formato sozinho não decide, a ESTRUTURA decide).
    """
    if not column_order or not page_text:
        return []
    n = len(column_order)

    flat: list[str] = []
    token_line: list[int] = []
    for li, ln in enumerate(page_text.splitlines()):
        for t in ln.split():
            flat.append(t)
            token_line.append(li)

    cursor = 0
    warnings: list[str] = []

    for row in rows:
        origem = str(row.get("origem", "")).strip()
        if not origem:
            continue
        o_tokens = origem.split()
        pos = _find_subsequence(flat, o_tokens, cursor)
        if pos is None:
            warnings.append(f'"{origem}": não localizada no texto da página — mantidos valores do LLM')
            continue

        label_end = pos + len(o_tokens)
        label_last_line = token_line[label_end - 1]
        k = label_end
        while k < len(flat) and token_line[k] == label_last_line:
            k += 1
        rest_mesma_linha = flat[label_end:k]  # colado ao rótulo -> Nota/código, nunca valor

        if len(rest_mesma_linha) >= n:
            # linha "compacta": rótulo + (nota) + N valores tudo junto
            value_tokens = rest_mesma_linha[-n:]
            consumed = k
        else:
            # linha "espalhada": o que sobrou colado ao rótulo é sempre
            # Nota/código (descartado); os N valores vêm das PRÓXIMAS
            # linhas, token a token
            vstart = k
            cand = flat[vstart: vstart + n]
            if len(cand) < n or not all(_is_value_token(t) for t in cand):
                warnings.append(
                    f'"{origem}": não foi possível localizar {n} valor(es) válidos após o rótulo — mantidos valores do LLM',
                )
                cursor = label_end
                continue
            value_tokens = cand
            consumed = vstart + n

        valores: dict[str, float] = {}
        for col, tok in zip(column_order, value_tokens):
            v = _to_number(tok)
            if v is not None:
                valores[col] = v
        row["valores"] = valores  # número é fato, não julgamento — SOBRESCREVE o LLM
        cursor = consumed

    return warnings


def flag_computed_totals(rows: list[dict], columns: list[str], tol: float = 0.6) -> int:
    """Marca `row["isTotal"]=True` para qualquer linha cujo valor bata
    ARITMETICAMENTE com a soma de um bloco de linhas imediatamente
    anteriores — mesmo sem a palavra "Total" no nome.

    Por quê: a extração já pega totais ÓBVIOS pelo rótulo ("Total
    circulante", regex "^tota(l|is)"), mas demonstrações reais têm
    subtotais SEM esse rótulo (ex.: "Patrimônio líquido dos
    controladores" = Capital + Reservas + Ações em tesouraria + ... +
    Lucro do período). Uma linha assim, não marcada, pode ser roteada
    pelo julgamental para um destino comum (ex.: "Outras Reservas"),
    somando de novo componentes já alocados individualmente — dobra o
    Patrimônio Líquido inteiro (foi exatamente o bug real observado).

    Mesmo princípio do módulo inteiro: estrutura vira código, não rótulo.
    Muta `rows` in-place (mantém a ordem = ordem de leitura do documento).
    Retorna quantas linhas foram marcadas.
    """
    cols = [c for c in columns
            if sum(1 for r in rows if c in (r.get("valores") or {})) >= 2]
    if not cols:
        return 0

    pendentes: list[dict] = []  # componentes ainda não "consumidos" por um total
    marcadas = 0
    for row in rows:
        vals = row.get("valores") or {}
        comuns = [c for c in cols if c in vals]
        if row.get("isTotal"):
            pendentes.append(row)  # um total já marcado pode compor um total maior
            continue
        if len(comuns) >= 2 and pendentes:
            achou = None
            for start in range(len(pendentes) - 1, -1, -1):  # janelas menores primeiro
                somas = {}
                ok = True
                for c in comuns:
                    s = sum((pendentes[k].get("valores") or {}).get(c, 0.0) for k in range(start, len(pendentes)))
                    somas[c] = s
                    if abs(s - vals[c]) > max(tol, abs(vals[c]) * 0.0005):
                        ok = False
                        break
                if ok and (len(pendentes) - start) >= 2:
                    achou = start
                    break
            if achou is not None:
                row["isTotal"] = True
                marcadas += 1
                del pendentes[achou:]
                pendentes.append(row)
                continue
        pendentes.append(row)
    return marcadas

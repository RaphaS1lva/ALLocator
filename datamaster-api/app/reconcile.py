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


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "").strip().lower())
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


def _rest_after_label(line_tokens: list[str], origem_tokens: list[str]) -> list[str] | None:
    """Se `line_tokens` começa com as mesmas palavras (normalizadas) de
    `origem_tokens`, devolve o RESTO da linha (rótulo removido)."""
    if not origem_tokens or len(origem_tokens) > len(line_tokens):
        return None
    for lt, ot in zip(line_tokens[: len(origem_tokens)], origem_tokens):
        if _norm(lt) != _norm(ot):
            return None
    return line_tokens[len(origem_tokens):]


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
    determinístico, quando a linha original for localizada e tokenizada com
    confiança (contagem de tokens bate com o nº de colunas da página).
    Muta `rows` in-place. Retorna a lista de avisos (origens não
    reconciliadas — nelas os valores do LLM foram mantidos, sem garantia).
    """
    if not column_order or not page_text:
        return []
    n = len(column_order)
    lines = [ln for ln in page_text.splitlines() if ln.strip()]
    available = list(range(len(lines)))  # índices de linha ainda não consumidos
    warnings: list[str] = []

    for row in rows:
        origem = str(row.get("origem", "")).strip()
        if not origem:
            continue
        o_tokens = origem.split()
        matched_idx, rest = None, None
        for i in available:
            r = _rest_after_label(lines[i].split(), o_tokens)
            if r is not None:
                matched_idx, rest = i, r
                break
        if matched_idx is None:
            warnings.append(f'"{origem}": linha não localizada no texto — mantidos valores do LLM')
            continue
        available.remove(matched_idx)

        if len(rest) < n:
            warnings.append(
                f'"{origem}": {len(rest)} token(s) após o rótulo, esperado(s) >= {n} — mantidos valores do LLM',
            )
            continue
        # os N ÚLTIMOS tokens = valores (posição = ordem das colunas); o que
        # sobrar ANTES (se houver) é coluna de Nota/código — descartado
        value_tokens = rest[-n:]
        if not all(_is_value_token(t) for t in value_tokens):
            warnings.append(f'"{origem}": tokens finais não parecem numéricos — mantidos valores do LLM')
            continue

        valores: dict[str, float] = {}
        for col, tok in zip(column_order, value_tokens):
            v = _to_number(tok)
            if v is not None:
                valores[col] = v
        row["valores"] = valores  # número é fato, não julgamento — SOBRESCREVE o LLM

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

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

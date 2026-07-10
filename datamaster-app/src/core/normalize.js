// Normalizacao de texto e numeros — porte fiel de gerar_excel_contabil.py
// (normalize_text, tokenize, token_overlap_score, strong_partial_match,
//  coerce_number). Modulo puro: funciona em browser e em node.

/**
 * Porte de normalize_text (py L118-124):
 * lower + strip + NFKD sem acentos + remove nao [a-z0-9\s] + colapsa espacos.
 */
export function normalizeText(value) {
  let text = String(value ?? '').trim().toLowerCase();
  // NFKD e remocao de marcas combinantes (equivale a unicodedata.combining)
  text = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  text = text.replace(/[^a-z0-9\s]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** strong_partial_match (py L127-130): igualdade OU substring em qualquer ordem. */
export function strongPartialMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** tokenize (py L133-134): conjunto de tokens nao vazios do texto normalizado. */
export function tokenize(text) {
  return new Set(normalizeText(text).split(' ').filter(Boolean));
}

/** token_overlap_score (py L137-144): indice de Jaccard entre conjuntos de tokens. */
export function tokenOverlap(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

/**
 * coerce_number (py L164-198): converte texto contabil em numero.
 * Trata R$, separadores BR (1.234,56) e US (1,234.56), e parenteses = negativo.
 * Retorna null quando vazio; preserva a string original se nao for numero.
 */
export function coerceNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  let text = String(value).trim();
  if (text === '') return null;
  let cleaned = text.replace(/R\$/g, '').replace(/\$/g, '').replace(/\s/g, '').trim();
  let neg = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    neg = true;
    cleaned = cleaned.slice(1, -1);
  }
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // BR: ponto = milhar, virgula = decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US: virgula = milhar
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    // ponto como separador de milhar PT-BR (1.000 -> 1000)
    cleaned = cleaned.replace(/\./g, '');
  }
  const num = Number(cleaned);
  if (Number.isNaN(num)) return value;
  const result = neg ? -num : num;
  return result;
}

/** Numero seguro (try_float, py L155-161): vazio/invalido -> 0. */
export function tryFloat(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

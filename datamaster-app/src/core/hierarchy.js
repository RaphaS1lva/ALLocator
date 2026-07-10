// Hierarquia / Totalizador / Alocacao da Hierarquia — porte de
// compute_totalizador_origens, _totalizador_flag, _hierarquia_display,
// normalize_alocacao_value (gerar_excel_contabil.py L1226-1275, L463-473).
import { normalizeText } from './normalize.js';

const TOTALIZADOR_SUFFIX = ' - Totalizador';

/** _strip_totalizador_suffix (py L1226-1230): idempotencia de legado. */
export function stripTotalizadorSuffix(name) {
  const s = String(name ?? '');
  return s.endsWith(TOTALIZADOR_SUFFIX) ? s.slice(0, -TOTALIZADOR_SUFFIX.length) : s;
}

/** normalize_alocacao_value (py L463-473): sim/s/yes/true/1 -> 'Sim', senao 'Não'. */
export function normalizeAlocacao(value) {
  const n = normalizeText(value);
  if (['sim', 's', 'yes', 'true', '1'].includes(n)) return 'Sim';
  return 'Não';
}

/**
 * compute_totalizador_origens (py L1233-1243): conjunto de origens (normalizadas)
 * que aparecem como `hierarquia` (pai) de ALGUMA OUTRA linha.
 */
export function computeTotalizadorOrigens(rows) {
  const origens = new Set(rows.map((r) => normalizeText(r.origem)));
  const parents = new Set();
  for (const r of rows) {
    const h = normalizeText(stripTotalizadorSuffix(r.hierarquia));
    if (!h) continue;
    // e' pai se a hierarquia aponta para uma origem existente e diferente da propria
    if (h !== normalizeText(r.origem) && origens.has(h)) parents.add(h);
  }
  return parents;
}

/** _totalizador_flag (py L1271-1275): 'Sim' se a origem e um totalizador. */
export function totalizadorFlag(row, totSet) {
  return totSet.has(normalizeText(row.origem)) ? 'Sim' : 'Não';
}

/**
 * _hierarquia_display (py L1246-1268):
 * - se a origem e totalizador -> nome da propria conta
 * - senao -> nome do pai (hierarquia) ; se vazio -> nome da propria conta
 * Nunca vazio.
 */
export function hierarquiaDisplay(row, totSet) {
  const origem = String(row.origem ?? '').trim();
  if (totSet.has(normalizeText(row.origem))) return origem;
  const pai = stripTotalizadorSuffix(row.hierarquia);
  const paiTrim = String(pai ?? '').trim();
  return paiTrim || origem;
}

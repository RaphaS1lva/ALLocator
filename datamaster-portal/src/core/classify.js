// Classificacao: grupo/subcategoria canonicos e regras especiais (PL/DRE).
// Porte de normalize_group, normalize_subcategory,
// apply_special_classification_rules e PL_SPECIFIC_ACCOUNTS (gerar_excel_contabil.py).
import { normalizeText } from './normalize.js';

// Contas de PL especificas (py L61-66) — sempre Grupo=Passivo, Sub=PL.
export const PL_SPECIFIC_ACCOUNTS = [
  'PARTICIPAÇÕES MINORITÁRIAS',
  'CAPITAL SOCIAL',
  'LUCROS ACUMULADOS',
  'OUTRAS RESERVAS',
];
const PL_SPECIFIC_NORM = new Set(PL_SPECIFIC_ACCOUNTS.map(normalizeText));

/** normalize_group (py ~L252-263): canoniza para Ativo/Passivo/DRE. */
export function normalizeGroup(value) {
  const n = normalizeText(value);
  if (!n) return '';
  if (n.includes('ativo')) return 'Ativo';
  if (n.includes('passivo')) return 'Passivo';
  if (n.includes('dre') || n.includes('resultado') || n.includes('demonstracao'))
    return 'DRE';
  // ja pode vir canonico
  if (n === 'ativo') return 'Ativo';
  if (n === 'passivo') return 'Passivo';
  return String(value ?? '').trim();
}

/** normalize_subcategory (py ~L266-279): Circulante / Não Circulante / PL / DRE. */
export function normalizeSubcategory(value) {
  const n = normalizeText(value);
  if (!n) return '';
  if (n === 'pl' || n.includes('patrimonio')) return 'PL';
  if (n.includes('dre')) return 'DRE';
  if (n.includes('nao circulante')) return 'Não Circulante';
  if (n.includes('circulante')) return 'Circulante';
  return String(value ?? '').trim();
}

/** true se a conta (origem/destino) e uma conta de PL especifica. */
export function isPlSpecific(name) {
  return PL_SPECIFIC_NORM.has(normalizeText(name));
}

/**
 * apply_special_classification_rules (py L282-302):
 * - se origem OU destino e PL-especifica -> Grupo=Passivo, Sub=PL
 * - se grupo canoniza para DRE -> Grupo=DRE, Sub=DRE
 * Recebe e devolve um objeto {origem, destino, grupo, subCategoria}.
 */
export function applySpecialClassification(row) {
  const r = { ...row };
  if (isPlSpecific(r.origem) || isPlSpecific(r.destino)) {
    r.grupo = 'Passivo';
    r.subCategoria = 'PL';
    return r;
  }
  const g = normalizeGroup(r.grupo);
  if (g === 'DRE') {
    r.grupo = 'DRE';
    r.subCategoria = 'DRE';
  }
  return r;
}

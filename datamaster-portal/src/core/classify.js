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
 * - se origem e PL-especifica -> Grupo=Passivo, Sub=PL (fato do documento,
 *   sempre seguro: o NOME da origem nao muda de um recalculo pro outro)
 * - se destino e PL-especifica -> idem, MAS só quando o grupo da linha
 *   ainda não é conhecido (vazio) ou já é Passivo — nunca sobrescreve um
 *   grupo JÁ determinado como Ativo/DRE só porque o destino (de um match
 *   anterior — memória antiga, sessão anterior, julgamental — possivelmente
 *   ERRADO) é uma conta de PL. Sem essa guarda, uma linha de DRE
 *   mal-casada UMA ÚNICA VEZ "se legitima" sozinha em todo recalculo
 *   seguinte (grupo passa a "concordar" com o destino errado, e a regra
 *   absoluta "DRE só pode ir para DRE" deixa de barrar o re-match — bug
 *   real observado em produção: "Controladores"/"Não controladores" da
 *   DRE presos em "PARTICIPAÇÕES MINORITÁRIAS" mesmo após a extração já
 *   vir com grupo=DRE correto do servidor).
 * - se grupo canoniza para DRE -> Grupo=DRE, Sub=DRE
 * Recebe e devolve um objeto {origem, destino, grupo, subCategoria}.
 */
export function applySpecialClassification(row) {
  const r = { ...row };
  if (isPlSpecific(r.origem)) {
    r.grupo = 'Passivo';
    r.subCategoria = 'PL';
    return r;
  }
  const gAtual = normalizeGroup(r.grupo);
  if (isPlSpecific(r.destino) && (!gAtual || gAtual === 'Passivo')) {
    r.grupo = 'Passivo';
    r.subCategoria = 'PL';
    return r;
  }
  if (gAtual === 'DRE') {
    r.grupo = 'DRE';
    r.subCategoria = 'DRE';
  }
  return r;
}

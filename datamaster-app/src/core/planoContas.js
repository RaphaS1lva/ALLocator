// Helpers sobre o Plano de Contas do template (Shadow).
// Ordem de grupo/sub (py GROUP_SUB_ORDER L583-590) e ordem de destino
// (build_destination_order py L641-673). Consome o seed PLANO_CONTAS.
import { PLANO_CONTAS } from '../data/planoContas.seed.js';
import { normalizeText } from './normalize.js';
import { structuralKey } from './keys.js';

export { PLANO_CONTAS };

// Ordem dos blocos do Plano de Contas (py L583-590).
export const GROUP_SUB_ORDER = {
  'Ativo|Circulante': 0,
  'Ativo|Não Circulante': 1,
  'Passivo|Circulante': 2,
  'Passivo|Não Circulante': 3,
  'Passivo|PL': 4,
  'DRE|DRE': 5,
};

export function groupSubOrder(grupo, sub) {
  const k = `${String(grupo ?? '').trim()}|${String(sub ?? '').trim()}`;
  return GROUP_SUB_ORDER[k] ?? 99;
}

// Somente as contas alocaveis (tipo 'conta' = tem SUMIFS no template).
export const CONTAS_ALOCAVEIS = PLANO_CONTAS.filter((p) => p.tipo === 'conta');

// Mapa chave-estrutural -> ordem (posicao na Shadow) para ordenacao/aninhamento.
const DEST_ORDER = new Map();
for (const p of PLANO_CONTAS) {
  DEST_ORDER.set(structuralKey(normalizeText(p.destino), p.grupo, p.subCategoria), p.ordem);
  // fallback so por nome normalizado
  const kName = normalizeText(p.destino);
  if (!DEST_ORDER.has(kName)) DEST_ORDER.set(kName, p.ordem);
}

/** Ordem do destino dentro do bloco (menor = aparece antes na Shadow). */
export function destinationOrder(destino, grupo, subCategoria) {
  const k = structuralKey(normalizeText(destino), grupo, subCategoria);
  if (DEST_ORDER.has(k)) return DEST_ORDER.get(k);
  const kName = normalizeText(destino);
  if (DEST_ORDER.has(kName)) return DEST_ORDER.get(kName);
  return 9999;
}

/** Encontra a linha do plano por destino/grupo/sub (ou so por nome). */
export function findAccount(destino, grupo, subCategoria) {
  const dn = normalizeText(destino);
  let byKey = PLANO_CONTAS.find(
    (p) => normalizeText(p.destino) === dn
      && normalizeText(p.grupo) === normalizeText(grupo)
      && normalizeText(p.subCategoria) === normalizeText(subCategoria),
  );
  if (byKey) return byKey;
  return PLANO_CONTAS.find((p) => normalizeText(p.destino) === dn) || null;
}

/** true se destino existe como conta alocavel compativel com grupo/sub. */
export function isValidDestino(destino, grupo, subCategoria) {
  const acc = findAccount(destino, grupo, subCategoria);
  return !!acc && acc.tipo === 'conta';
}

// Destinos que NUNCA devem receber alocacao direta (totais/reconciliacao) —
// Guia §15. Usados apenas para AVISO no parecer (nao bloqueiam).
export const DESTINOS_BLOQUEADOS = new Set([
  '- Despesas/Custo de Aluguel',
  '+/-Provisões Operacionais',
].map(normalizeText));

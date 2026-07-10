// Regras de sinal — Guia §14.1 (prefixo do destino), §14.2 (balancete por
// grupo) e Regras §8.7 (1o digito do codigo contabil). Estas regras vivem
// upstream no CustomGPT (nao no .py); porte fiel para o front.
import { coerceNumber } from './normalize.js';

/**
 * Classifica o prefixo de sinal do NOME do destino:
 *  'pm'   -> comeca com '+/-'  => preserva o sinal do OCR
 *  'neg'  -> comeca com '-'    => grava |OCR| (positivo); template subtrai
 *  'pos'  -> comeca com '+'    => grava |OCR| (positivo); template soma
 *  'none' -> sem prefixo       => preserva o sinal do OCR (na pratica positivo)
 */
export function signKind(destino) {
  const n = String(destino ?? '').trim();
  if (/^\+\s*\/\s*-/.test(n) || n.startsWith('+/-')) return 'pm';
  if (n.startsWith('-')) return 'neg';
  if (n.startsWith('+')) return 'pos';
  return 'none';
}

/**
 * §14.1: valor a gravar em Ano N a partir do valor de apresentacao e do destino.
 * neg/pos -> |valor| ; pm/none -> preserva o sinal.
 */
export function applySignByDestino(valorApresentacao, destino) {
  const v = coerceNumber(valorApresentacao);
  if (v === null || v === '' || typeof v !== 'number') return v;
  const kind = signKind(destino);
  if (kind === 'neg' || kind === 'pos') return Math.abs(v);
  return v; // pm | none => preserva
}

/**
 * Sinal do grupo para conversao de BALANCETE (§14.2 / Regras §8.5):
 *  Ativo (devedor)      -> +1
 *  Passivo/PL (credor)  -> -1
 *  DRE                  -> -1 (inverter sempre)
 */
export function sinalGrupo(grupo) {
  const g = String(grupo ?? '').trim().toLowerCase();
  if (g.startsWith('ativo')) return 1;
  if (g.startsWith('passivo')) return -1;
  if (g.startsWith('dre')) return -1;
  return 1;
}

/** §14.2: saldo de balancete -> valor de apresentacao (antes do §14.1). */
export function balanceteToApresentacao(saldoBalancete, grupo) {
  const v = coerceNumber(saldoBalancete);
  if (typeof v !== 'number') return v;
  return v * sinalGrupo(grupo);
}

/**
 * Regras §8.7: 1o digito do codigo contabil define o grupo (prevalece sobre nome).
 *  1=Ativo, 2=Passivo/PL, 3=Despesa(DRE), 4=Receita(DRE), 5=Apuracao(DRE).
 * Retorna {grupo, natureza} ou null se nao houver codigo.
 */
export function grupoFromCodigo(codigo) {
  const m = String(codigo ?? '').trim().match(/^(\d)/);
  if (!m) return null;
  switch (m[1]) {
    case '1': return { grupo: 'Ativo', natureza: 'ativo' };
    case '2': return { grupo: 'Passivo', natureza: 'passivo/pl' };
    case '3': return { grupo: 'DRE', natureza: 'despesa' };
    case '4': return { grupo: 'DRE', natureza: 'receita' };
    case '5': return { grupo: 'DRE', natureza: 'apuracao' };
    default: return null;
  }
}

/**
 * Pipeline de sinal completo p/ um valor entrado pelo usuario.
 * @param {number|string} raw  valor lido no documento (com o sinal como aparece)
 * @param {string} destino     nome do destino no template
 * @param {string} grupo       Ativo/Passivo/DRE do destino
 * @param {object} [opts]
 * @param {boolean} [opts.isBalancete=false] fonte e balancete bruto?
 * @returns {number|null} valor a gravar em Ano N
 */
export function computeStoredValue(raw, destino, grupo, opts = {}) {
  let v = coerceNumber(raw);
  if (v === null || v === '' ) return null;
  if (typeof v !== 'number') return v;
  if (opts.isBalancete) v = v * sinalGrupo(grupo);
  return applySignByDestino(v, destino);
}

/**
 * Validacao §14.1: para destinos '-'/'+' (nao '+/-'), o valor deve ser >= 0.
 * Retorna true se OK.
 */
export function signIsValid(valor, destino) {
  const v = coerceNumber(valor);
  if (typeof v !== 'number' || v === 0) return true;
  const kind = signKind(destino);
  if (kind === 'neg' || kind === 'pos') return v >= 0;
  return true; // pm/none aceita qualquer sinal
}

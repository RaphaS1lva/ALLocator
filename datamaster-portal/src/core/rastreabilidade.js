// Montagem da Rastreabilidade (14 colunas A..N) — anos alinhados a DIREITA
// (mais recente em Ano 3), totalizador/hierarquia, chaves, ordenacao.
// Porte de compute_years, sort_merged_rows, append_rastreabilidade,
// fill_tracking_formulas (gerar_excel_contabil.py).
import { coerceNumber } from './normalize.js';
import { chaveOrigem, chaveDestino } from './keys.js';
import {
  computeTotalizadorOrigens, totalizadorFlag, hierarquiaDisplay, normalizeAlocacao,
} from './hierarchy.js';
import { groupSubOrder, destinationOrder } from './planoContas.js';

/** Ordena anos como numero quando possivel (py sort_year_key L147-152). */
function yearKey(y) {
  const n = parseInt(String(y).trim(), 10);
  return Number.isNaN(n) ? [1, String(y)] : [0, n];
}

/**
 * compute_years (py L593-598) + regra de janela: reune os anos distintos das
 * linhas, ordena ascendente e mantem no MAXIMO os 3 mais recentes.
 */
export function computeYears(rows) {
  const set = new Set();
  for (const r of rows) {
    const v = r.valores || {};
    for (const y of Object.keys(v)) {
      if (v[y] !== null && v[y] !== undefined && v[y] !== '') set.add(String(y).trim());
    }
  }
  let years = [...set].sort((a, b) => {
    const ka = yearKey(a); const kb = yearKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0;
  });
  if (years.length > 3) years = years.slice(years.length - 3); // 3 mais recentes
  return years;
}

/**
 * Alinha os anos a direita nos 3 slots (Ano 1/2/3). Retorna a lista de 3 slots
 * {header, year} onde header e o ano real ou 'Ano N' (placeholder) se vazio.
 */
export function alignYearHeaders(years) {
  const slots = [
    { slot: 'Ano 1', year: null },
    { slot: 'Ano 2', year: null },
    { slot: 'Ano 3', year: null },
  ];
  const offset = 3 - years.length;
  years.forEach((y, i) => { slots[offset + i].year = y; });
  return slots.map((s) => ({ ...s, header: s.year != null ? String(s.year) : s.slot }));
}

/** Valor de um ano especifico para a linha (aplica coerceNumber). */
function valorAno(row, year) {
  if (year == null) return null;
  const v = (row.valores || {})[year];
  const n = coerceNumber(v);
  return typeof n === 'number' ? n : null;
}

/**
 * Finaliza as linhas: preenche ano1/ano2/ano3 alinhados, totalizador (C),
 * hierarquia de exibicao (B), alocacao normalizada (D) e chaves (M/N).
 * Retorna novo array (nao muta os originais).
 */
export function finalizeRows(rows, years) {
  const totSet = computeTotalizadorOrigens(rows);
  const slots = alignYearHeaders(years); // 3 slots com year|null
  return rows.map((r) => {
    const alocacao = normalizeAlocacao(r.alocacaoHierarquia);
    const base = {
      ...r,
      alocacaoHierarquia: alocacao,
      totalizador: totalizadorFlag(r, totSet),
      hierarquiaDisplay: hierarquiaDisplay(r, totSet),
      ano1: valorAno(r, slots[0].year),
      ano2: valorAno(r, slots[1].year),
      ano3: valorAno(r, slots[2].year),
    };
    // Tipo de Mapeamento fica vazio quando alocacao = 'Não' (py main L3028-3034)
    if (alocacao !== 'Sim') base.tipoMapeamento = '';
    else if (!base.tipoMapeamento || base.tipoMapeamento === 'Referência') {
      base.tipoMapeamento = 'Julgamental';
    }
    base.chave = chaveOrigem(base);
    base.chaveDestino = chaveDestino(base);
    return base;
  });
}

/**
 * sort_merged_rows (py L741-770): ordem do Plano de Contas.
 * (groupSubOrder, has_destino, destinationOrder, origem alfabetica).
 */
export function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const g = groupSubOrder(a.grupo, a.subCategoria) - groupSubOrder(b.grupo, b.subCategoria);
    if (g) return g;
    const ha = a.destino && String(a.destino).trim() ? 0 : 1;
    const hb = b.destino && String(b.destino).trim() ? 0 : 1;
    if (ha !== hb) return ha - hb;
    const d = destinationOrder(a.destino, a.grupo, a.subCategoria)
      - destinationOrder(b.destino, b.grupo, b.subCategoria);
    if (d) return d;
    return String(a.origem || '').localeCompare(String(b.origem || ''), 'pt');
  });
}

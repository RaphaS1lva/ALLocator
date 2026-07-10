// Matching Origem -> Destino — porte de match_dictionary_entry /
// match_shadow_entry (gerar_excel_contabil.py L831-918, L1077-1162).
// Ordem de alocacao: Memoria (empresa) -> Dicionario -> Julgamental.
import {
  normalizeText, strongPartialMatch, tokenOverlap, tokenize,
} from './normalize.js';
import { applySpecialClassification } from './classify.js';

// Limiar de overlap de tokens para candidato parcial (py L862-864).
export const OVERLAP_THRESHOLD = 0.60;

/** Pre-computa indice de busca a partir de entradas {origem,destino,grupo,subCategoria}. */
export function buildIndex(entries) {
  return (entries || []).map((e) => {
    const origemNorm = normalizeText(e.origem);
    return {
      ...e,
      origemNorm,
      grupoNorm: normalizeText(e.grupo),
      subNorm: normalizeText(e.subCategoria),
      tokenCount: tokenize(e.origem).size,
    };
  });
}

/**
 * match_dictionary_entry (py L831-886): melhor entrada para uma linha.
 * Filtro duro: se row-grupo e entry-grupo existem e diferem -> pula (idem sub).
 * Exatos: origemNorm igual. Parciais: substring OU overlap >= 0.60.
 * Ranking exato:   (subMatch?0:1, -tokenCount, len)
 * Ranking parcial: (-overlap, subMatch?0:1, -tokenCount)
 */
export function matchEntry(row, index) {
  const origemNorm = normalizeText(row.origem);
  if (!origemNorm) return null;
  const grupoNorm = normalizeText(row.grupo);
  const subNorm = normalizeText(row.subCategoria);

  const exact = [];
  const partial = [];
  for (const entry of index) {
    if (grupoNorm && entry.grupoNorm && grupoNorm !== entry.grupoNorm) continue;
    if (subNorm && entry.subNorm && subNorm !== entry.subNorm) continue;
    if (origemNorm === entry.origemNorm) {
      exact.push(entry);
    } else if (strongPartialMatch(origemNorm, entry.origemNorm)) {
      partial.push({ entry, score: tokenOverlap(origemNorm, entry.origemNorm) });
    } else {
      const s = tokenOverlap(origemNorm, entry.origemNorm);
      if (s >= OVERLAP_THRESHOLD) partial.push({ entry, score: s });
    }
  }

  const subMatch = (e) => (subNorm && e.subNorm && subNorm === e.subNorm ? 0 : 1);

  if (exact.length) {
    exact.sort((a, b) => {
      const d1 = subMatch(a) - subMatch(b);
      if (d1) return d1;
      const d2 = b.tokenCount - a.tokenCount; // -tokenCount
      if (d2) return d2;
      return a.origemNorm.length - b.origemNorm.length;
    });
    return exact[0];
  }
  if (partial.length) {
    partial.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score; // -overlap
      const d1 = subMatch(a.entry) - subMatch(b.entry);
      if (d1) return d1;
      return b.entry.tokenCount - a.entry.tokenCount;
    });
    return partial[0].entry;
  }
  return null;
}

/**
 * apply_*_mapping (py L889-918 / L1132-1162): preenche destino/grupo/sub e
 * tipo apenas para linhas SEM destino ainda. Nao sobrescreve destino existente.
 * @param {Array} rows linhas mutaveis {origem,destino,grupo,subCategoria,tipoMapeamento,...}
 * @param {Array} index indice pre-computado (buildIndex)
 * @param {string} tipo rotulo do tipo de mapeamento ('Dicionário' | 'Memoria Anterior')
 */
export function applyMapping(rows, index, tipo) {
  for (const row of rows) {
    if (row.destino && String(row.destino).trim() !== '') continue; // preserva destino do usuario
    if (row.noAuto) continue; // usuario RETIROU a conta manualmente — nao realocar
    const m = matchEntry(row, index);
    if (!m) continue;
    row.destino = m.destino;
    if (m.grupo) row.grupo = m.grupo;
    if (m.subCategoria) row.subCategoria = m.subCategoria;
    row.tipoMapeamento = tipo;
    const fixed = applySpecialClassification({
      origem: row.origem, destino: row.destino, grupo: row.grupo, subCategoria: row.subCategoria,
    });
    row.grupo = fixed.grupo;
    row.subCategoria = fixed.subCategoria;
  }
  return rows;
}

/**
 * annotate_dictionary_source (py L921-948): se a linha ja tinha destino e
 * tipo vazio/Julgamental, e o dicionario mapeia a MESMA origem para o MESMO
 * destino, re-rotula tipo -> 'Dicionário' (nunca muda o destino).
 */
export function annotateDictionarySource(rows, dictIndex) {
  for (const row of rows) {
    const destino = String(row.destino ?? '').trim();
    if (!destino) continue;
    const tipo = String(row.tipoMapeamento ?? '').trim();
    if (tipo && tipo !== 'Julgamental') continue;
    const m = matchEntry(row, dictIndex);
    if (m && normalizeText(m.destino) === normalizeText(destino)) {
      row.tipoMapeamento = 'Dicionário';
    }
  }
  return rows;
}

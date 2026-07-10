// Orquestrador do pipeline contabil (equivalente ao main() do .py, porem
// client-side). Recebe as linhas digitadas pelo usuario e devolve
// Rastreabilidade finalizada + Shadow + parecer (QA).
import { applySpecialClassification } from './classify.js';
import { buildIndex, applyMapping, annotateDictionarySource } from './matching.js';
import { computeStoredValue } from './sign.js';
import { coerceNumber } from './normalize.js';
import {
  computeYears, finalizeRows, sortRows, alignYearHeaders,
} from './rastreabilidade.js';
import { computeShadow } from './shadow.js';
import { runQA } from './qa.js';
import { DICIONARIO_SEED } from '../data/dicionario.seed.js';

/** Garante o formato canonico de uma linha de entrada. */
function normalizeRow(input) {
  return {
    id: input.id ?? null,
    origem: String(input.origem ?? '').trim(),
    hierarquia: String(input.hierarquia ?? '').trim(),
    paginaReferencia: String(input.paginaReferencia ?? input.pagina ?? '').trim(),
    valores: { ...(input.valores || {}) }, // valores CRUS por ano (como no documento)
    grupo: String(input.grupo ?? '').trim(),
    subCategoria: String(input.subCategoria ?? '').trim(),
    destino: String(input.destino ?? '').trim(),
    tipoMapeamento: String(input.tipoMapeamento ?? '').trim(),
    alocacaoHierarquia: input.alocacaoHierarquia ?? '',
    codigo: String(input.codigo ?? '').trim(),
    isBalancete: input.isBalancete ?? undefined,
  };
}

/** Aplica a regra de sinal (§14.1/§14.2) apos o destino estar definido. */
function applySignToRows(rows, globalIsBalancete) {
  for (const r of rows) {
    const isBal = r.isBalancete ?? globalIsBalancete ?? false;
    r.valoresRaw = { ...r.valores };
    const applied = {};
    for (const [ano, raw] of Object.entries(r.valores)) {
      if (r.destino && String(r.destino).trim()) {
        applied[ano] = computeStoredValue(raw, r.destino, r.grupo, { isBalancete: isBal });
      } else {
        const n = coerceNumber(raw);
        applied[ano] = typeof n === 'number' ? n : null;
      }
    }
    r.valores = applied;
  }
  return rows;
}

/**
 * Executa o pipeline completo.
 * @param {Array} inputRows linhas digitadas pelo usuario
 * @param {object} [opts]
 *   dicionario     : entradas do dicionario (default: seed)
 *   companyMemory  : memoria anterior da empresa (do banco) p/ matching
 *   adjustments    : ajustes Retirar/Adicionar/inversor por chaveDestino
 *   isBalancete    : documento e balancete bruto? (afeta sinal)
 * @returns {{rows, years, yearHeaders, shadow, qa}}
 */
export function runPipeline(inputRows, opts = {}) {
  let rows = (inputRows || []).map(normalizeRow);

  // 1) classificacao especial (PL/DRE)
  for (const r of rows) {
    const fixed = applySpecialClassification(r);
    r.grupo = fixed.grupo; r.subCategoria = fixed.subCategoria;
  }

  // 2) Memoria Anterior (empresa) -> 3) Dicionario  (so preenche destino vazio)
  if (opts.companyMemory && opts.companyMemory.length) {
    applyMapping(rows, buildIndex(opts.companyMemory), 'Memoria Anterior');
  }
  const dictEntries = opts.dicionario || DICIONARIO_SEED;
  const dictIndex = buildIndex(dictEntries);
  applyMapping(rows, dictIndex, 'Dicionário');
  annotateDictionarySource(rows, dictIndex);

  // 4) sinal (depende do destino)
  applySignToRows(rows, opts.isBalancete);

  // 5) anos + finalizacao (totalizador/hierarquia/chaves/anoN) + ordenacao
  const years = computeYears(rows);
  const finalized = finalizeRows(rows, years);
  const sorted = sortRows(finalized);

  // 6) Shadow + 7) QA/parecer
  const shadow = computeShadow(sorted, { adjustments: opts.adjustments });
  const qa = runQA(sorted, shadow, dictIndex);

  return {
    rows: sorted,
    years,
    yearHeaders: alignYearHeaders(years),
    shadow,
    qa,
    dictIndex,
  };
}

export { DICIONARIO_SEED };

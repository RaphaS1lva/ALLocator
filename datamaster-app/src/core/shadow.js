// Shadow — agregacao das alocacoes (substitui os SUMIFS do template) e
// avaliacao dos subtotais/totais via SHADOW_COMPUTE. Tambem monta a
// Memoria Atual (lista de chaves) e a identidade Ativo = Passivo + PL.
import { SHADOW_COMPUTE } from '../data/shadowCompute.seed.js';
import { structuralKey } from './keys.js';

const ANOS = ['ano1', 'ano2', 'ano3'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Agrega as linhas da Rastreabilidade (alocacao='Sim') por Chave Destino
 * (destino|grupo|sub). Retorna Map key -> {ano1,ano2,ano3, chaves[], origens[]}.
 */
export function aggregateAllocations(rastRows) {
  const byKey = new Map();
  for (const r of rastRows || []) {
    if (r.alocacaoHierarquia !== 'Sim') continue;
    const key = r.chaveDestino || structuralKey(r.destino, r.grupo, r.subCategoria);
    if (!r.destino || !String(r.destino).trim()) continue;
    if (!byKey.has(key)) byKey.set(key, { ano1: 0, ano2: 0, ano3: 0, chaves: [], origens: [] });
    const a = byKey.get(key);
    a.ano1 += num(r.ano1); a.ano2 += num(r.ano2); a.ano3 += num(r.ano3);
    if (r.chave) a.chaves.push(r.chave);
    a.origens.push(r.origem);
  }
  return byKey;
}

function buildSideResolver(sideSpec, agg, adjustments, isDre) {
  const specByRow = new Map(sideSpec.map((s) => [s.row, s]));
  const memo = new Map(); // `${row}|${ano}` -> number

  function evalRow(row, ano) {
    const ck = `${row}|${ano}`;
    if (memo.has(ck)) return memo.get(ck);
    const spec = specByRow.get(row);
    if (!spec) { memo.set(ck, 0); return 0; }
    let val = 0;
    if (spec.kind === 'agg') {
      const key = structuralKey(spec.destino, spec.grupo, spec.subCategoria);
      const a = agg.get(key);
      val = a ? num(a[ano]) : 0;
      const adj = adjustments[key];
      if (adj && isDre && adj.inversor) val = -val;
      // Ajustes manuais Retirar/Adicionar (opcional): valores numericos por ano
      if (adj && adj.adicionar) val += num(adj.adicionar[ano]);
      if (adj && adj.retirar) val -= num(adj.retirar[ano]);
    } else {
      for (const term of spec.terms || []) {
        let s = 0;
        for (const rr of term.rows) s += evalRow(rr, ano);
        val += (term.sign || 1) * s;
      }
    }
    memo.set(ck, val);
    return val;
  }
  return { specByRow, evalRow };
}

/**
 * Calcula a Shadow completa a partir das linhas da Rastreabilidade.
 * @param {Array} rastRows linhas finalizadas (com chave/chaveDestino/anoN)
 * @param {object} [options] { adjustments: { [chaveDestino]: {inversor, retirar, adicionar} } }
 * @returns {object} { ativoPassivo, dre, totals, balance }
 */
export function computeShadow(rastRows, options = {}) {
  const agg = aggregateAllocations(rastRows);
  const adjustments = options.adjustments || {};

  const apRes = buildSideResolver(SHADOW_COMPUTE.AP, agg, adjustments, false);
  const dreRes = buildSideResolver(SHADOW_COMPUTE.DRE, agg, adjustments, true);

  const shapeSide = (spec, res, isDre) => spec.map((s) => {
    const key = s.kind === 'agg'
      ? structuralKey(s.destino, s.grupo, s.subCategoria) : null;
    const a = key ? agg.get(key) : null;
    return {
      row: s.row,
      destino: s.destino,
      grupo: s.grupo || (isDre ? 'DRE' : ''),
      subCategoria: s.subCategoria || (isDre ? 'DRE' : ''),
      tipo: s.kind === 'agg' ? 'conta' : 'subtotal',
      sign: s.sign || 'none',
      ano1: res.evalRow(s.row, 'ano1'),
      ano2: res.evalRow(s.row, 'ano2'),
      ano3: res.evalRow(s.row, 'ano3'),
      memoriaAtual: a ? a.chaves.slice() : [],
      origens: a ? a.origens.slice() : [],
    };
  });

  const ativoPassivo = shapeSide(SHADOW_COMPUTE.AP, apRes, false);
  const dre = shapeSide(SHADOW_COMPUTE.DRE, dreRes, true);

  // Totais-chave (por linha do template)
  const apVal = (row, ano) => apRes.evalRow(row, ano);
  const totals = {};
  for (const ano of ANOS) {
    totals[ano] = {
      totalAtivo: apVal(41, ano),
      totalPassivo: apVal(72, ano),
      patrimonioLiquido: apVal(79, ano),
      recursosProprios: apVal(80, ano), // minoritarios + PL
    };
  }

  // Identidade Ativo = Passivo + PL (RECURSOS PROPRIOS = minoritarios + PL)
  const balance = {};
  for (const ano of ANOS) {
    const ativo = totals[ano].totalAtivo;
    const passivoPl = totals[ano].totalPassivo + totals[ano].recursosProprios;
    const dif = ativo - passivoPl;
    balance[ano] = { ativo, passivoPl, dif, ok: Math.abs(dif) < 0.5 };
  }

  return { ativoPassivo, dre, totals, balance };
}

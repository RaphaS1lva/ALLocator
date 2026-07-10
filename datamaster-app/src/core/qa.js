// QA / Parecer — porte das validacoes de gerar_excel_contabil.py
// (validate_*), incl. a identidade Ativo = Passivo + PL (regra GPT-side),
// regra de sinal (§14.1) e a matriz de cobertura de valores.
import { normalizeText } from './normalize.js';
import { signIsValid, signKind } from './sign.js';
import { isPlSpecific } from './classify.js';
import { computeTotalizadorOrigens } from './hierarchy.js';
import { findAccount, DESTINOS_BLOQUEADOS } from './planoContas.js';
import { matchEntry } from './matching.js';

export const TOTALIZADOR_PROMOCAO_MIN_FILHOS = 5;

const issue = (level, code, msg) => ({ level, code, msg });
const hasVal = (r) => [r.ano1, r.ano2, r.ano3].some((v) => v !== null && v !== undefined && v !== '');
const hasRelevantVal = (r) => [r.ano1, r.ano2, r.ano3].some((v) => Number(v) && Number.isFinite(Number(v)) && Number(v) !== 0);
const isSim = (r) => r.alocacaoHierarquia === 'Sim';

/** Sub compativel com o grupo (py validate_subcategoria L2154-2167). */
function validateSubcategoria(rows) {
  const out = [];
  for (const r of rows) {
    const g = r.grupo; const s = r.subCategoria;
    if (g === 'Ativo' && !['Circulante', 'Não Circulante'].includes(s)) out.push(issue('warn', 'subcat', `Ativo com Sub Categoria inválida: "${r.origem}" (${s || 'vazio'})`));
    if (g === 'Passivo' && !['Circulante', 'Não Circulante', 'PL'].includes(s)) out.push(issue('warn', 'subcat', `Passivo com Sub Categoria inválida: "${r.origem}" (${s || 'vazio'})`));
    if (g === 'DRE' && s !== 'DRE') out.push(issue('warn', 'subcat', `DRE deve ter Sub Categoria = DRE: "${r.origem}"`));
  }
  return out;
}

/** Contas de PL especificas -> Passivo/PL (py validate_pl_specific_accounts). */
function validatePlSpecific(rows) {
  const out = [];
  for (const r of rows) {
    if (isPlSpecific(r.origem) || isPlSpecific(r.destino)) {
      if (r.grupo !== 'Passivo' || r.subCategoria !== 'PL') {
        out.push(issue('error', 'pl', `Conta de PL deve ser Grupo=Passivo, Sub=PL: "${r.origem}" (${r.grupo}/${r.subCategoria})`));
      }
    }
  }
  return out;
}

/** Dupla alocacao: mesma chave de origem -> destinos diferentes (Sim). */
function validateDuplicateAllocation(rows) {
  const out = [];
  const byChave = new Map();
  for (const r of rows.filter(isSim)) {
    if (!r.chave) continue;
    if (!byChave.has(r.chave)) byChave.set(r.chave, new Set());
    byChave.get(r.chave).add(r.chaveDestino);
  }
  for (const [chave, dests] of byChave) {
    if (dests.size > 1) out.push(issue('error', 'dup', `Origem alocada a destinos diferentes (dupla contagem): ${chave} -> ${[...dests].join(' ; ')}`));
  }
  return out;
}

/** Destino compativel com o template (py validate_template_destination_structure). */
function validateDestinoStructure(rows) {
  const out = [];
  for (const r of rows.filter(isSim)) {
    if (!r.destino) { out.push(issue('warn', 'dest', `Linha "Sim" sem destino: "${r.origem}"`)); continue; }
    const acc = findAccount(r.destino, r.grupo, r.subCategoria);
    if (!acc) { out.push(issue('error', 'dest', `Destino inexistente no template: "${r.destino}" (${r.origem})`)); continue; }
    if (normalizeText(acc.grupo) !== normalizeText(r.grupo)) out.push(issue('error', 'dest', `Grupo do destino difere: "${r.destino}" é ${acc.grupo}, linha é ${r.grupo}`));
    if (acc.tipo !== 'conta') out.push(issue('warn', 'dest', `Destino é subtotal/total (não alocável): "${r.destino}" (${r.origem})`));
    if (DESTINOS_BLOQUEADOS.has(normalizeText(r.destino))) out.push(issue('warn', 'bloq', `Destino de reconciliação (evite alocar direto): "${r.destino}"`));
  }
  return out;
}

/** Irmaos divergentes (py validate_sibling_consistency L2390-2418). */
function validateSiblingConsistency(rows) {
  const out = [];
  const byParent = new Map();
  for (const r of rows.filter(isSim)) {
    const parent = normalizeText(r.hierarquia);
    if (!parent || parent === normalizeText(r.origem)) continue;
    const k = `${parent}|${r.grupo}`;
    if (!byParent.has(k)) byParent.set(k, new Map());
    const dests = byParent.get(k);
    dests.set(r.chaveDestino, (dests.get(r.chaveDestino) || 0) + 1);
  }
  for (const [k, dests] of byParent) {
    if (dests.size > 1) out.push(issue('warn', 'sibling', `Irmãos do pai "${k.split('|')[0]}" alocados a destinos diferentes: ${[...dests.keys()].join(' ; ')} — revise a classificação pela hierarquia`));
  }
  return out;
}

/** Dupla contagem pai+filhos (py validate_alocacao_consistency L2451-2478). */
function validateAlocacaoConsistency(rows, totSet) {
  const out = [];
  const childrenSimByParent = new Map();
  for (const r of rows.filter(isSim)) {
    const parent = normalizeText(r.hierarquia);
    if (parent && parent !== normalizeText(r.origem)) {
      childrenSimByParent.set(parent, (childrenSimByParent.get(parent) || 0) + 1);
    }
  }
  for (const r of rows.filter(isSim)) {
    const on = normalizeText(r.origem);
    if (totSet.has(on) && childrenSimByParent.get(on)) {
      out.push(issue('error', 'double', `Dupla contagem: totalizador "${r.origem}" e ${childrenSimByParent.get(on)} abertura(s) marcados "Sim" ao mesmo tempo`));
    }
  }
  return out;
}

/** Sugestao de promover totalizador (py validate_totalizer_promotion L2570-2624). */
function validateTotalizerPromotion(rows, totSet) {
  const out = [];
  // agrupa filhos Sim por pai; totalizador do pai deve estar 'Não'
  const parentInfo = new Map(); // parent -> {dests:Set, count, totalizadorRow}
  for (const r of rows) {
    const parent = normalizeText(r.hierarquia);
    if (parent && parent !== normalizeText(r.origem) && isSim(r)) {
      if (!parentInfo.has(parent)) parentInfo.set(parent, { dests: new Set(), count: 0 });
      const info = parentInfo.get(parent);
      info.count += 1; info.dests.add(r.chaveDestino);
    }
  }
  for (const r of rows) {
    const on = normalizeText(r.origem);
    if (totSet.has(on) && !isSim(r)) {
      const info = parentInfo.get(on);
      if (info && info.count >= TOTALIZADOR_PROMOCAO_MIN_FILHOS && info.dests.size === 1) {
        out.push(issue('info', 'promote', `Considere promover o totalizador "${r.origem}" a "Sim" (${info.count} aberturas atomizadas no mesmo destino) e rebaixar as aberturas a contexto`));
      }
    }
  }
  return out;
}

/** Cobertura de valores (py validate_year_value_coverage L2550-2567). */
function validateYearValueCoverage(rows) {
  const out = [];
  let zeradas = 0;
  for (const r of rows.filter(isSim)) {
    if (!hasRelevantVal(r)) { zeradas += 1; out.push(issue('warn', 'zero', `Linha "Sim" sem valor relevante (zerada/vazia): "${r.origem}" -> "${r.destino}"`)); }
  }
  return { out, zeradas };
}

/** Regra de sinal §14.1 (py Guia L580-585). */
function validateSign(rows) {
  const out = [];
  for (const r of rows.filter(isSim)) {
    for (const [i, v] of [r.ano1, r.ano2, r.ano3].entries()) {
      if (!signIsValid(v, r.destino)) {
        out.push(issue('error', 'sign', `Sinal inválido em Ano ${i + 1} de "${r.origem}" -> "${r.destino}" (destino ${signKind(r.destino)} exige valor ≥ 0): ${v}`));
      }
    }
  }
  return out;
}

/** Divergencia GPT x Dicionario (py validate_gpt_vs_dictionary), ignora Memoria Anterior. */
function validateVsDictionary(rows, dictIndex) {
  const out = [];
  if (!dictIndex || !dictIndex.length) return out;
  for (const r of rows.filter(isSim)) {
    if (r.tipoMapeamento === 'Memoria Anterior') continue;
    const m = matchEntry(r, dictIndex);
    if (m && normalizeText(m.destino) !== normalizeText(r.destino)) {
      out.push(issue('info', 'dic', `Destino diverge do dicionário: "${r.origem}" alocado em "${r.destino}", dicionário sugere "${m.destino}"`));
    }
  }
  return out;
}

/** Ativo = Passivo + PL, a partir do resultado da Shadow. */
function validateBalance(shadow) {
  const out = [];
  if (!shadow || !shadow.balance) return out;
  for (const ano of ['ano1', 'ano2', 'ano3']) {
    const b = shadow.balance[ano];
    if (!b) continue;
    if (Math.abs(b.ativo) < 0.5 && Math.abs(b.passivoPl) < 0.5) continue; // sem dados
    if (!b.ok) out.push(issue('error', 'balance', `${ano.toUpperCase()}: Ativo (${fmt(b.ativo)}) ≠ Passivo + PL (${fmt(b.passivoPl)}) — diferença ${fmt(b.dif)}`));
  }
  return out;
}

function fmt(n) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(n)); }

/** Matriz de cobertura (py compute_rastreabilidade_coverage L2512-2547). */
function coverage(rows, totSet) {
  const cov = { simComValor: 0, simSemValor: 0, naoComValor: 0, naoSemValor: 0 };
  for (const r of rows) {
    const sim = isSim(r); const v = hasVal(r);
    if (sim && v) cov.simComValor += 1;
    else if (sim && !v) cov.simSemValor += 1;
    else if (!sim && v) cov.naoComValor += 1;
    else cov.naoSemValor += 1;
  }
  const totalizadores = { total: 0, alocadosSim: 0 };
  for (const r of rows) {
    if (totSet.has(normalizeText(r.origem)) && r._counted !== true) { /* count uniques below */ }
  }
  const totOrigens = new Set([...totSet]);
  totalizadores.total = totOrigens.size;
  const simTot = new Set();
  for (const r of rows) if (totSet.has(normalizeText(r.origem)) && isSim(r)) simTot.add(normalizeText(r.origem));
  totalizadores.alocadosSim = simTot.size;
  return { cobertura: cov, totalizadores };
}

/**
 * Executa todas as validacoes e monta o parecer.
 * @param {Array} rows linhas finalizadas da Rastreabilidade
 * @param {object} shadow resultado de computeShadow
 * @param {Array} dictIndex indice do dicionario (buildIndex)
 */
export function runQA(rows, shadow, dictIndex = []) {
  const totSet = computeTotalizadorOrigens(rows);
  const issues = [];
  issues.push(...validateSubcategoria(rows));
  issues.push(...validatePlSpecific(rows));
  issues.push(...validateDuplicateAllocation(rows));
  issues.push(...validateDestinoStructure(rows));
  issues.push(...validateSiblingConsistency(rows));
  issues.push(...validateAlocacaoConsistency(rows, totSet));
  issues.push(...validateTotalizerPromotion(rows, totSet));
  const yv = validateYearValueCoverage(rows);
  issues.push(...yv.out);
  issues.push(...validateSign(rows));
  issues.push(...validateVsDictionary(rows, dictIndex));
  issues.push(...validateBalance(shadow));

  const { cobertura, totalizadores } = coverage(rows, totSet);

  // Parecer / summary (py generate_summary L2627-2650)
  const anosSet = new Set();
  for (const r of rows) { if (r.ano1 != null) anosSet.add('Ano 1'); }
  const tipos = {};
  const alocacaoCount = { Sim: 0, Não: 0 };
  for (const r of rows) {
    alocacaoCount[isSim(r) ? 'Sim' : 'Não'] += 1;
    if (isSim(r)) tipos[r.tipoMapeamento || 'Julgamental'] = (tipos[r.tipoMapeamento || 'Julgamental'] || 0) + 1;
  }
  const totaisPorGrupo = {};
  for (const r of rows.filter(isSim)) {
    const k = `${r.grupo}|${r.subCategoria}`;
    totaisPorGrupo[k] = (totaisPorGrupo[k] || 0) + 1;
  }

  const summary = {
    quantidadeLinhas: rows.length,
    quantidadeAlocadas: alocacaoCount.Sim,
    quantidadeContexto: alocacaoCount['Não'],
    tiposMapeamento: tipos,
    totaisPorGrupo,
    cobertura,
    totalizadores,
    simAlocadasZeradas: yv.zeradas,
    contasCapturadas: rows.length,
    nErros: issues.filter((i) => i.level === 'error').length,
    nAvisos: issues.filter((i) => i.level === 'warn').length,
    balance: shadow ? shadow.balance : null,
  };

  return { issues, summary };
}

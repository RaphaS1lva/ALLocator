// Análise financeira do cliente a partir da Shadow calculada:
// KPIs com variação ano a ano e "drivers" de atenção (uptriggers/downtriggers),
// no vocabulário que o analista de crédito usa.
import { normalizeText } from '../core/normalize.js';

const SLOTS = ['ano1', 'ano2', 'ano3'];

/** anos reais alinhados à direita -> slots ano1..3 usados na Shadow. */
export function yearSlots(years) {
  const off = 3 - (years?.length || 0);
  return (years || []).map((y, i) => ({ year: String(y), slot: SLOTS[off + i] }));
}

function lookup(list, name, grupo) {
  const n = normalizeText(name);
  return (list || []).find((r) => normalizeText(r.destino) === n
    && (!grupo || normalizeText(r.grupo) === normalizeText(grupo))) || null;
}

const val = (row, slot) => (row ? Number(row[slot]) || 0 : 0);

/**
 * Calcula KPIs e drivers.
 * @returns {{ kpis: Array, drivers: Array, hasData: boolean }}
 * kpi: { label, unit: 'money'|'pct'|'x', perYear: [{year, value}], delta, trigger }
 * driver: { kind: 'up'|'down'|'warn', text }
 */
export function computeAnalysis(result) {
  if (!result) return { kpis: [], drivers: [], hasData: false };
  const { shadow, years, qa } = result;
  const slots = yearSlots(years);
  if (!slots.length) return { kpis: [], drivers: [], hasData: false };

  const ap = shadow.ativoPassivo;
  const dre = shadow.dre;

  const receita = lookup(dre, 'Vendas Líquidas');
  const resultadoBruto = lookup(dre, 'Resultado Bruto');
  const ebitda = lookup(dre, 'EBITDA');
  const lucro = lookup(dre, 'Lucro Liquido');
  const ac = lookup(ap, 'TOTAL ATIVO CIRCULANTE');
  const pc = lookup(ap, 'TOTAL PASSIVO CIRCULANTE');
  const pl = lookup(ap, 'PATRIMÔNIO LÍQUIDO');
  const dividaRows = [
    lookup(ap, 'Bancos', 'Passivo'), lookup(ap, 'Outras Dividas Financeiras', 'Passivo'),
    lookup(ap, 'Confirming', 'Passivo'), lookup(ap, 'Mútuo Financeiro', 'Passivo'),
    lookup(ap, 'Bancos LP', 'Passivo'), lookup(ap, 'Outras Dividas Financeiras LP', 'Passivo'),
    lookup(ap, 'Mútuo Financeiro LP', 'Passivo'),
  ].filter(Boolean);

  const serie = (fn) => slots.map(({ year, slot }) => ({ year, value: fn(slot) }));
  const divida = (slot) => dividaRows.reduce((s, r) => s + val(r, slot), 0);
  const safeDiv = (a, b) => (Math.abs(b) > 0.005 ? a / b : null);

  const kpis = [];
  const push = (label, unit, fn, triggerFn) => {
    const perYear = serie(fn);
    const nn = perYear.filter((p) => p.value != null);
    if (!nn.some((p) => Math.abs(p.value) > 0.0005)) return null; // sem dado -> não polui
    let delta = null; let trigger = null;
    if (nn.length >= 2) {
      const prev = nn[nn.length - 2].value; const cur = nn[nn.length - 1].value;
      delta = { prev, cur, abs: cur - prev, pct: Math.abs(prev) > 0.005 ? (cur - prev) / Math.abs(prev) : null };
      if (triggerFn) trigger = triggerFn(cur, prev, delta);
    } else if (triggerFn) trigger = triggerFn(nn[nn.length - 1]?.value, null, null);
    const k = { label, unit, perYear, delta, trigger };
    kpis.push(k);
    return k;
  };

  const kReceita = push('Receita líquida', 'money', (s) => val(receita, s),
    (cur, prev, d) => (d && d.pct != null ? (d.pct > 0.02 ? 'up' : (d.pct < -0.02 ? 'down' : null)) : null));

  const margem = (row) => (s) => safeDiv(val(row, s), val(receita, s));
  push('Margem bruta', 'pct', margem(resultadoBruto),
    (cur, prev) => (prev != null && cur != null ? (cur - prev > 0.01 ? 'up' : (cur - prev < -0.01 ? 'down' : null)) : null));
  const kMgEbitda = push('Margem EBITDA', 'pct', margem(ebitda),
    (cur, prev) => (prev != null && cur != null ? (cur - prev > 0.01 ? 'up' : (cur - prev < -0.01 ? 'down' : null)) : null));
  const kLucro = push('Lucro líquido', 'money', (s) => val(lucro, s),
    (cur, prev, d) => (cur != null && cur < 0 ? 'down' : (d && d.abs > 0 ? 'up' : (d && d.abs < 0 ? 'down' : null))));
  const kLiq = push('Liquidez corrente (AC/PC)', 'x', (s) => safeDiv(val(ac, s), val(pc, s)),
    (cur) => (cur != null ? (cur < 1 ? 'down' : (cur >= 1.2 ? 'up' : null)) : null));
  const kAlav = push('Dívida financeira / EBITDA', 'x',
    (s) => (val(ebitda, s) > 0.005 ? divida(s) / val(ebitda, s) : null),
    (cur, prev) => (cur != null ? (cur > 3 ? 'down' : (prev != null && cur < prev ? 'up' : null)) : null));
  const kPl = push('Patrimônio líquido', 'money', (s) => val(pl, s),
    (cur, prev, d) => (cur != null && cur < 0 ? 'down' : (d ? (d.abs > 0 ? 'up' : (d.abs < 0 ? 'down' : null)) : null)));

  // ---------------- drivers (narrativa) ----------------
  const drivers = [];
  const pctTxt = (p) => `${p > 0 ? '+' : ''}${(p * 100).toFixed(1)}%`;
  const lastYear = slots[slots.length - 1]?.year;

  if (kReceita?.delta?.pct != null) {
    drivers.push({
      kind: kReceita.delta.pct >= 0 ? 'up' : 'down',
      text: `Receita líquida ${kReceita.delta.pct >= 0 ? 'cresceu' : 'caiu'} ${pctTxt(kReceita.delta.pct)} em ${lastYear}.`,
    });
  }
  if (kMgEbitda?.delta) {
    const pp = (kMgEbitda.delta.cur - kMgEbitda.delta.prev) * 100;
    if (Math.abs(pp) >= 0.5) {
      drivers.push({
        kind: pp >= 0 ? 'up' : 'down',
        text: `Margem EBITDA ${pp >= 0 ? 'expandiu' : 'comprimiu'} ${Math.abs(pp).toFixed(1)} p.p. (${(kMgEbitda.delta.cur * 100).toFixed(1)}% em ${lastYear}).`,
      });
    }
  }
  const lucroCur = kLucro?.perYear?.[kLucro.perYear.length - 1]?.value;
  if (lucroCur != null && lucroCur < 0) {
    drivers.push({ kind: 'down', text: `Prejuízo líquido no período mais recente (${lastYear}).` });
  }
  const liqCur = kLiq?.perYear?.[kLiq.perYear.length - 1]?.value;
  if (liqCur != null && liqCur < 1) {
    drivers.push({ kind: 'down', text: `Liquidez corrente abaixo de 1 (${liqCur.toFixed(2)}x): AC não cobre o PC.` });
  }
  const alavCur = kAlav?.perYear?.[kAlav.perYear.length - 1]?.value;
  if (alavCur != null && alavCur > 3) {
    drivers.push({ kind: 'down', text: `Alavancagem elevada: dívida financeira em ${alavCur.toFixed(1)}x EBITDA.` });
  }
  const plCur = kPl?.perYear?.[kPl.perYear.length - 1]?.value;
  if (plCur != null && plCur < 0) {
    drivers.push({ kind: 'down', text: 'Passivo a descoberto (PL negativo).' });
  }

  // qualidade do planilhamento (bloqueantes primeiro)
  const balKeys = yearSlots(years);
  const aberto = balKeys.filter(({ slot }) => shadow.balance[slot] && !shadow.balance[slot].ok
    && (Math.abs(shadow.balance[slot].ativo) > 0.5 || Math.abs(shadow.balance[slot].passivoPl) > 0.5));
  if (aberto.length) {
    // Diagnóstico do Guia §14.3 (causa nº 1): se a diferença ≈ Resultado do
    // Exercício, o balanço veio "não encerrado" — o resultado ainda não foi
    // transportado ao PL. Oferece a correção em um clique.
    const casam = aberto.filter(({ slot }) => {
      const dif = shadow.balance[slot].dif;
      const ll = val(lucro, slot);
      const tol = Math.max(1, Math.abs(shadow.balance[slot].ativo) * 0.01);
      return Math.abs(ll) > 0.005 && Math.abs(dif - ll) <= tol;
    });
    if (casam.length && casam.length === aberto.length) {
      const valores = {};
      for (const { year, slot } of casam) valores[year] = val(lucro, slot);
      drivers.push({
        kind: 'warn',
        text: `Balanço não fecha em ${aberto.map((a) => a.year).join(', ')}, mas a diferença ≈ Resultado do Exercício — balancete não encerrado: falta transportar o resultado ao PL (Guia §14.3).`,
        action: {
          type: 'transporteResultado',
          label: 'Transportar resultado para Lucros Acumulados',
          valores,
        },
      });
    } else {
      drivers.push({
        kind: 'warn',
        text: `Balanço não fecha em ${aberto.map((a) => a.year).join(', ')} — investigar: conta sem destino, dupla contagem, sinal ou grupo trocado (Guia §14.3).`,
      });
    }
  }
  const semDestino = (result.rows || []).filter((r) => r.alocacaoHierarquia === 'Sim' && !r.destino).length;
  if (semDestino) drivers.push({ kind: 'warn', text: `${semDestino} conta(s) alocada(s) ainda sem destino no template.` });
  const nJulg = result.qa?.summary?.tiposMapeamento?.Julgamental || 0;
  if (nJulg) drivers.push({ kind: 'warn', text: `${nJulg} alocação(ões) julgamental(is) — priorize na revisão.` });

  return { kpis, drivers, hasData: kpis.length > 0 };
}

export function fmtKpi(value, unit) {
  if (value == null || Number.isNaN(value)) return '—';
  if (unit === 'pct') return `${(value * 100).toFixed(1)}%`;
  if (unit === 'x') return `${value.toFixed(2)}x`;
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

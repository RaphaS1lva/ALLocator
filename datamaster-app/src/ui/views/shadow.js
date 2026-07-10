// Tela 3: Shadow ao vivo (Ativo/Passivo/PL + DRE) e identidade Ativo=Passivo+PL.
import { el, clear, money } from '../dom.js';

function numTd(v) {
  const td = el('td', { class: 'num' });
  const n = Number(v);
  if (v == null || n === 0) { td.textContent = ''; return td; }
  const span = el('span', n < 0 ? { class: 'neg' } : {}, money(v));
  td.appendChild(span);
  return td;
}

function sideTable(title, items, yearHeaders) {
  const yh = yearHeaders.map((y) => y.header);
  const head = el('tr', {}, [
    el('th', {}, 'Conta'),
    ...yh.map((y) => el('th', { class: 'num' }, y)),
    el('th', {}, 'Memória Atual (origens)'),
  ]);
  const body = el('tbody');
  for (const it of items) {
    const isConta = it.tipo === 'conta';
    const isTotal = /^TOTAL|PATRIM|RECURSOS/i.test(it.destino);
    const tr = el('tr', { class: isTotal ? 'total' : (isConta ? '' : 'sub') }, [
      el('td', {}, it.destino),
      numTd(it.ano1), numTd(it.ano2), numTd(it.ano3),
      el('td', { class: 'muted', style: 'font-size:11px' }, (it.memoriaAtual || []).join('  +  ')),
    ]);
    body.appendChild(tr);
  }
  return el('div', { class: 'panel' }, [
    el('h2', {}, title),
    el('div', { class: 'table-wrap' }, el('table', {}, [el('thead', {}, head), body])),
  ]);
}

export function renderShadow(container, ctx) {
  const { state } = ctx;
  clear(container);
  if (!state.result) { container.appendChild(el('div', { class: 'panel muted' }, 'Adicione contas na aba "Entrada" para ver o Shadow.')); return; }
  const { shadow, yearHeaders } = state.result;

  // Cartoes de balanco por ano
  const cards = el('div', { class: 'panel' }, [
    el('h2', {}, 'Equilíbrio patrimonial (Ativo = Passivo + PL)'),
    el('div', { class: 'balance' }, ['ano1', 'ano2', 'ano3'].map((ano, i) => {
      const b = shadow.balance[ano];
      const header = yearHeaders[i].header;
      const empty = Math.abs(b.ativo) < 0.5 && Math.abs(b.passivoPl) < 0.5;
      return el('div', { class: `card ${empty ? '' : (b.ok ? 'ok' : 'err')}` }, [
        el('div', { class: 'lbl' }, header),
        el('div', { class: 'val' }, empty ? '—' : money(b.ativo)),
        el('div', { class: 'muted', style: 'font-size:12px' }, empty ? 'sem dados' : `P+PL: ${money(b.passivoPl)} · dif: ${money(b.dif)}`),
        el('div', {}, empty ? '' : el('span', { class: `badge ${b.ok ? 'sim' : 'julg'}` }, b.ok ? 'FECHA' : 'NÃO FECHA')),
      ]);
    })),
  ]);

  container.appendChild(cards);
  container.appendChild(sideTable('Balanço Patrimonial (Ativo / Passivo / PL)', shadow.ativoPassivo, yearHeaders));
  container.appendChild(sideTable('Demonstração de Resultados (DRE)', shadow.dre, yearHeaders));
}

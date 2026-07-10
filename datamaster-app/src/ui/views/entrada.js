// Tela 2: Entrada manual de contas (substitui o OCR). Grid editavel.
import { el, clear, toast } from '../dom.js';
import { CONTAS_ALOCAVEIS } from '../../core/planoContas.js';

const SUBS = {
  Ativo: ['Circulante', 'Não Circulante'],
  Passivo: ['Circulante', 'Não Circulante', 'PL'],
  DRE: ['DRE'],
};

function opt(v, sel, placeholder) {
  return el('option', { value: v, selected: v === sel ? true : null }, v === '' ? (placeholder || '—') : v);
}

function destinosDatalist() {
  const seen = new Set();
  const opts = [];
  for (const c of CONTAS_ALOCAVEIS) {
    if (seen.has(c.destino)) continue;
    seen.add(c.destino);
    opts.push(el('option', { value: c.destino }));
  }
  return el('datalist', { id: 'destinos-list' }, opts);
}

export function renderEntrada(container, ctx) {
  const { state, actions } = ctx;
  clear(container);

  const anos = (state.header.anos && state.header.anos.length) ? state.header.anos : ['Ano'];

  const toolbar = el('div', { class: 'toolbar' }, [
    el('button', { class: 'btn primary', onclick: () => { actions.addRow(); } }, '+ Adicionar linha'),
    el('button', { class: 'btn', onclick: () => actions.openImport() }, '⭱ Importar (xlsx/csv/colar)'),
    el('button', { class: 'btn', onclick: () => actions.autoAllocate() }, 'Auto-alocar destinos'),
    el('button', { class: 'btn ghost', onclick: () => actions.addExample() }, 'Inserir exemplo'),
    el('button', { class: 'btn ghost', onclick: () => { if (confirm('Limpar todas as linhas?')) actions.clearRows(); } }, 'Limpar'),
    el('span', { class: 'spacer' }),
    el('span', { class: 'pill' }, `${state.rows.length} linha(s)`),
  ]);

  const headRow = el('tr', {}, [
    el('th', {}, 'Origem'), el('th', {}, 'Hierarquia (pai)'), el('th', {}, 'Pág.'),
    el('th', {}, 'Grupo'), el('th', {}, 'Sub'),
    ...anos.map((a) => el('th', { class: 'num' }, a)),
    el('th', {}, 'Destino no Template'), el('th', {}, 'Aloc.'), el('th', {}, 'Tipo'), el('th', {}, ''),
  ]);

  const tbody = el('tbody');
  state.rows.forEach((row) => tbody.appendChild(rowEl(row, anos, actions)));

  const table = el('table', {}, [el('thead', {}, headRow), tbody]);
  const wrap = el('div', { class: 'table-wrap' }, table);

  const panel = el('div', { class: 'panel' }, [
    el('h2', {}, 'Entrada de contas (BP + DRE)'),
    el('p', { class: 'hint' }, 'Digite as contas lidas do documento. Deixe o Destino em branco para o sistema sugerir (Memória → Dicionário). Valores negativos podem ser digitados com "-" ou entre parênteses. Marque Alocação = Sim para a linha contar no Shadow.'),
    toolbar, wrap, destinosDatalist(),
  ]);
  container.appendChild(panel);
  container._tbody = tbody; // referencia p/ patch de badges
}

function rowEl(row, anos, actions) {
  const inp = (field, extra = {}) => el('input', {
    value: row[field] ?? '', ...extra,
    oninput: (e) => actions.updateRow(row.id, field, e.target.value),
  });
  const sel = (field, opts, extra = {}) => el('select', {
    onchange: (e) => actions.updateRow(row.id, field, e.target.value, { rerenderRow: field === 'grupo' }),
    ...extra,
  }, opts);

  const grupoSel = sel('grupo', ['', 'Ativo', 'Passivo', 'DRE'].map((v) => opt(v, row.grupo, 'Grupo')));
  const subs = SUBS[row.grupo] || [];
  const subSel = sel('subCategoria', ['', ...subs].map((v) => opt(v, row.subCategoria, 'Sub')));

  const valCells = anos.map((a) => el('td', { class: 'cell num' }, el('input', {
    class: 'num', style: 'text-align:right',
    value: (row.valores && row.valores[a] != null) ? row.valores[a] : '',
    oninput: (e) => actions.updateValue(row.id, a, e.target.value),
  })));

  const destino = el('input', {
    value: row.destino ?? '', list: 'destinos-list', placeholder: '(sugerir)',
    oninput: (e) => actions.updateRow(row.id, 'destino', e.target.value),
  });
  const aloc = sel('alocacaoHierarquia', ['Não', 'Sim'].map((v) => opt(v, row.alocacaoHierarquia === 'Sim' ? 'Sim' : 'Não')));

  const tr = el('tr', { dataset: { rowid: row.id } }, [
    el('td', { class: 'cell' }, inp('origem', { placeholder: 'Nome da conta' })),
    el('td', { class: 'cell' }, inp('hierarquia', { placeholder: 'pai (opcional)' })),
    el('td', { class: 'cell' }, inp('paginaReferencia', { style: 'width:48px' })),
    el('td', { class: 'cell' }, grupoSel),
    el('td', { class: 'cell' }, subSel),
    ...valCells,
    el('td', { class: 'cell' }, destino),
    el('td', { class: 'cell' }, aloc),
    el('td', { dataset: { tipocell: row.id } }, tipoBadge(row._tipo)),
    el('td', {}, el('button', { class: 'btn ghost', title: 'Remover', onclick: () => actions.deleteRow(row.id) }, '✕')),
  ]);
  return tr;
}

function tipoBadge(tipo) {
  if (!tipo) return el('span', { class: 'muted' }, '—');
  const cls = tipo === 'Dicionário' ? 'dic' : tipo === 'Memoria Anterior' ? 'mem' : 'julg';
  return el('span', { class: `badge ${cls}` }, tipo);
}

/** Atualiza os badges de Tipo apos recompute, sem re-renderizar o grid. */
export function patchTipoBadges(container, result) {
  if (!container || !container._tbody) return;
  const byId = new Map(result.rows.map((r) => [String(r.id), r]));
  for (const td of container.querySelectorAll('[data-tipocell]')) {
    const match = byId.get(String(td.dataset.tipocell));
    const tipo = match && match.alocacaoHierarquia === 'Sim' ? match.tipoMapeamento : '';
    clear(td).appendChild(tipoBadge(tipo));
  }
}

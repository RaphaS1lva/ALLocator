// Controlador principal do app (vanilla, sem dependencias).
import { runPipeline } from '../core/index.js';
import { createRepository } from '../db/repository.js';
import { downloadWorkbook } from '../excel/exportWorkbook.js';
import {
  el, $, clear, toast, money,
} from './dom.js';
import { renderHeader } from './views/header.js';
import { renderEntrada, patchTipoBadges } from './views/entrada.js';
import { renderShadow } from './views/shadow.js';
import { renderParecer } from './views/parecer.js';
import { renderDicionario } from './views/dicionario.js';
import { openImportModal } from './views/importModal.js';

const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`);

const state = {
  header: {
    empresa: '', cnpj: '', grupo: '', modelo: '', auditado: '', consolidado: '',
    unidade: 'Mil', moeda: 'BRL', isBalancete: false, anos: [String(new Date().getFullYear())],
  },
  rows: [],
  currentAnaliseId: null,
  dicionario: [],
  _companyMemory: [],
  _dicLog: [],
  _dicQuery: '',
  result: null,
  activeTab: 'header',
};

let repo;
let recomputeTimer;
const views = {};
const TABS = [
  { id: 'header', label: 'Cabeçalho' },
  { id: 'entrada', label: 'Entrada de contas' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'parecer', label: 'Parecer / QA' },
  { id: 'dicionario', label: 'Dicionário' },
];

function newRow(patch = {}) {
  return {
    id: uid(), origem: '', hierarquia: '', paginaReferencia: '', grupo: '', subCategoria: '',
    destino: '', alocacaoHierarquia: 'Não', tipoMapeamento: '', valores: {}, ...patch,
  };
}

// ----------------------------- pipeline -----------------------------
function recompute() {
  state.result = runPipeline(state.rows, {
    dicionario: state.dicionario.length ? state.dicionario : undefined,
    companyMemory: state._companyMemory,
    isBalancete: state.header.isBalancete,
  });
  // views sem inputs podem re-renderizar sempre; entrada apenas recebe patch
  if (views.shadow) renderShadow(views.shadow, ctx());
  if (views.parecer) renderParecer(views.parecer, ctx());
  if (views.entrada) patchTipoBadges(views.entrada, state.result);
  updateBalanceBadge();
}
function scheduleRecompute() { clearTimeout(recomputeTimer); recomputeTimer = setTimeout(recompute, 250); }

// ----------------------------- actions -----------------------------
const actions = {
  setHeader(patch, opts = {}) {
    Object.assign(state.header, patch);
    updateEmpresaTag();
    if (opts.anosChanged && state.activeTab === 'entrada') renderActive();
    scheduleRecompute();
  },
  addRow() { state.rows.push(newRow()); if (state.activeTab === 'entrada') renderActive(); },
  clearRows() { state.rows = []; renderActive(); recompute(); },
  updateRow(id, field, value, opts = {}) {
    const r = state.rows.find((x) => x.id === id); if (!r) return;
    r[field] = value;
    if (opts.rerenderRow) renderActive();
    scheduleRecompute();
  },
  updateValue(id, ano, value) {
    const r = state.rows.find((x) => x.id === id); if (!r) return;
    if (!r.valores) r.valores = {};
    if (value === '' || value == null) delete r.valores[ano]; else r.valores[ano] = value;
    scheduleRecompute();
  },
  deleteRow(id) { state.rows = state.rows.filter((x) => x.id !== id); renderActive(); scheduleRecompute(); },
  autoAllocate() {
    recompute();
    const byId = new Map(state.result.rows.map((r) => [r.id, r]));
    let n = 0;
    for (const r of state.rows) {
      if ((!r.destino || !r.destino.trim())) {
        const res = byId.get(r.id);
        if (res && res.destino) { r.destino = res.destino; r.grupo = res.grupo; r.subCategoria = res.subCategoria; n += 1; }
      }
    }
    renderActive(); recompute();
    toast(`${n} destino(s) preenchido(s) automaticamente.`, 'ok');
  },
  addExample() { loadExample(); },
  openImport() { openImportModal(ctx()); },
  importRows(rows, anos) {
    const mapped = (rows || []).map((r) => ({ ...newRow(), ...r, id: r.id || uid() }));
    state.rows.push(...mapped);
    if (anos && anos.length) state.header.anos = anos.slice(0, 3);
    // Alocação automática: preenche os destinos vazios (Memória -> Dicionário)
    recompute();
    const byId = new Map(state.result.rows.map((r) => [String(r.id), r]));
    for (const r of state.rows) {
      if (!r.destino || !String(r.destino).trim()) {
        const res = byId.get(String(r.id));
        if (res && res.destino) { r.destino = res.destino; r.grupo = res.grupo; r.subCategoria = res.subCategoria; }
      }
    }
    if (state.activeTab !== 'entrada') setTab('entrada'); else renderActive();
    recompute(); updateEmpresaTag();
  },
  async save() {
    if (!state.rows.length) { toast('Nada para salvar.', 'error'); return; }
    recompute();
    const analise = {
      id: state.currentAnaliseId || undefined,
      ...state.header,
      rows: state.result.rows,     // linhas ja finalizadas (com chaves/anoN)
      adjustments: {},
      anos: state.result.years,
    };
    const saved = await repo.saveAnalise(analise);
    state.currentAnaliseId = saved.id;
    await refreshDicionario();
    await refreshAnalises();
    toast('Análise salva. Dicionário atualizado automaticamente.', 'ok');
  },
  exportExcel() {
    recompute();
    if (!state.result.rows.length) { toast('Adicione contas antes de exportar.', 'error'); return; }
    const nome = downloadWorkbook(state.result, state.header, state.dicionario);
    toast(`Excel gerado: ${nome}`, 'ok');
  },
  newAnalise() {
    state.currentAnaliseId = null;
    state.rows = [];
    state.header = { empresa: '', cnpj: '', grupo: '', modelo: '', auditado: '', consolidado: '', unidade: 'Mil', moeda: 'BRL', isBalancete: false, anos: [String(new Date().getFullYear())] };
    state._companyMemory = [];
    recompute(); updateEmpresaTag(); setTab('header');
    toast('Nova análise iniciada.');
  },
  async loadAnalise(id) {
    if (!id) return;
    const a = await repo.getAnalise(id);
    if (!a) return;
    state.currentAnaliseId = a.id;
    state.header = {
      empresa: a.empresa || '', cnpj: a.cnpj || '', grupo: a.grupo || '', modelo: a.modelo || '',
      auditado: a.auditado || '', consolidado: a.consolidado || '', unidade: a.unidade || 'Mil',
      moeda: a.moeda || 'BRL', isBalancete: !!a.is_balancete || !!a.isBalancete, anos: a.anos || [],
    };
    // reconstrucao das linhas editaveis a partir do salvo
    state.rows = (a.rows || []).map((r) => rebuildEditableRow(r, state.header.anos));
    state._companyMemory = await repo.getCompanyMemory(state.header.cnpj);
    recompute(); updateEmpresaTag(); setTab('entrada');
    toast('Análise carregada.');
  },
  async addDicEntry(entry) { await repo.upsertDicionarioEntry(entry); await refreshDicionario(); if (state.activeTab === 'dicionario') renderActive(); toast('Regra adicionada ao dicionário.', 'ok'); },
  async deleteDicEntry(id) { await repo.deleteDicionarioEntry(id); await refreshDicionario(); if (state.activeTab === 'dicionario') renderActive(); },
};

function ctx() { return { state, actions }; }

// Reconstroi valores por ano a partir de uma linha salva (ano1/2/3 -> anos reais)
function rebuildEditableRow(r, anos) {
  const valores = {};
  const slots = [r.ano1, r.ano2, r.ano3];
  const offset = 3 - (anos ? anos.length : 0);
  (anos || []).forEach((y, i) => { const v = slots[offset + i]; if (v != null) valores[y] = v; });
  return {
    id: r.id || uid(), origem: r.origem || '', hierarquia: r.hierarquia || '', paginaReferencia: r.paginaReferencia || '',
    grupo: r.grupo || '', subCategoria: r.subCategoria || '', destino: r.destino || '',
    alocacaoHierarquia: r.alocacaoHierarquia === 'Sim' ? 'Sim' : 'Não', tipoMapeamento: r.tipoMapeamento || '', valores,
  };
}

// ----------------------------- data loads -----------------------------
async function refreshDicionario() {
  state.dicionario = await repo.getDicionario();
  try { state._dicLog = await repo.listLog(50); } catch { state._dicLog = []; }
}
async function refreshAnalises() {
  const list = await repo.listAnalises();
  const sel = $('#analises-select');
  if (!sel) return;
  clear(sel);
  sel.appendChild(el('option', { value: '' }, `Análises salvas (${list.length})`));
  for (const a of list) sel.appendChild(el('option', { value: a.id }, `${a.empresa || '(sem nome)'} — ${a.nLinhas || 0} linhas`));
}

// ----------------------------- chrome/topbar -----------------------------
function updateEmpresaTag() {
  const tag = $('#empresa-tag');
  if (tag) tag.textContent = state.header.empresa ? state.header.empresa : 'nova análise';
}
function updateBalanceBadge() {
  const b = $('#balance-badge');
  if (!b || !state.result) return;
  const bal = state.result.shadow.balance.ano3;
  const empty = Math.abs(bal.ativo) < 0.5 && Math.abs(bal.passivoPl) < 0.5;
  b.className = `empresa-tag ${empty ? '' : (bal.ok ? '' : '')}`;
  b.textContent = empty ? 'A=P+PL: —' : (bal.ok ? 'A = P+PL ✓' : `A≠P+PL (dif ${money(bal.dif)})`);
  b.style.background = empty ? 'rgba(255,255,255,.15)' : (bal.ok ? 'rgba(255,255,255,.25)' : '#7a0000');
}

function setTab(id) {
  state.activeTab = id;
  for (const t of TABS) {
    views[t.id].classList.toggle('active', t.id === id);
    $(`#tab-${t.id}`).classList.toggle('active', t.id === id);
  }
  renderActive();
}
function renderActive() {
  const id = state.activeTab;
  const c = views[id];
  if (id === 'header') renderHeader(c, ctx());
  else if (id === 'entrada') renderEntrada(c, ctx());
  else if (id === 'shadow') renderShadow(c, ctx());
  else if (id === 'parecer') renderParecer(c, ctx());
  else if (id === 'dicionario') renderDicionario(c, ctx());
}

// ----------------------------- exemplo demo -----------------------------
function loadExample() {
  state.header = { empresa: 'Indústrias Exemplo S.A.', cnpj: '12.345.678/0001-90', grupo: 'Grupo Exemplo', modelo: 'Consolidado', auditado: 'Sim', consolidado: 'Sim', unidade: 'Mil', moeda: 'BRL', isBalancete: false, anos: ['2023', '2024'] };
  const R = (o, g, s, d, al, v, hier) => newRow({ origem: o, grupo: g, subCategoria: s, destino: d, alocacaoHierarquia: al, valores: v, hierarquia: hier || '' });
  state.rows = [
    R('Caixa e bancos', 'Ativo', 'Circulante', 'Caixa', 'Sim', { 2023: 800, 2024: 1000 }),
    R('Aplicações financeiras', 'Ativo', 'Circulante', 'Aplicações Financeiras', 'Sim', { 2023: 300, 2024: 450 }),
    R('Clientes nacionais', 'Ativo', 'Circulante', '', 'Sim', { 2023: 1200, 2024: 1500 }),
    R('Estoque de produtos acabados', 'Ativo', 'Circulante', 'Produtos Acabados', 'Sim', { 2023: 600, 2024: 700 }),
    R('Imobilizado', 'Ativo', 'Não Circulante', 'Edificios, maquinas e outros', 'Sim', { 2023: 2000, 2024: 2100 }),
    R('Fornecedores nacionais', 'Passivo', 'Circulante', 'Fornecedores', 'Sim', { 2023: 500, 2024: 650 }),
    R('Empréstimos bancários CP', 'Passivo', 'Circulante', 'Bancos', 'Sim', { 2023: 400, 2024: 500 }),
    R('Financiamentos LP', 'Passivo', 'Não Circulante', 'Bancos LP', 'Sim', { 2023: 900, 2024: 1000 }),
    R('Capital social', 'Passivo', 'PL', 'Capital Social', 'Sim', { 2023: 2500, 2024: 2500 }),
    R('Lucros/prejuízos acumulados', 'Passivo', 'PL', 'Lucros Acumulados', 'Sim', { 2023: 1100, 2024: 1600 }),
    R('Receita bruta de vendas', 'DRE', 'DRE', 'Vendas Totais', 'Sim', { 2023: 8000, 2024: 9500 }),
    R('Impostos sobre vendas', 'DRE', 'DRE', '-Impostos', 'Sim', { 2023: -1200, 2024: -1400 }),
    R('CMV', 'DRE', 'DRE', '-Custo de Produtos Vendidos', 'Sim', { 2023: -4000, 2024: -4600 }),
    R('Despesas administrativas', 'DRE', 'DRE', '- Despesas Administrativas', 'Sim', { 2023: -1000, 2024: -1100 }),
  ];
  state.currentAnaliseId = null;
  updateEmpresaTag(); recompute(); setTab('entrada');
  toast('Exemplo carregado — veja o Shadow e o Parecer.', 'ok');
}

// ----------------------------- bootstrap -----------------------------
async function boot() {
  repo = createRepository();
  await repo.init();
  await refreshDicionario();

  const app = $('#app');
  // topbar
  const analisesSel = el('select', { id: 'analises-select', class: 'btn', onchange: (e) => actions.loadAnalise(e.target.value) }, [el('option', { value: '' }, 'Análises salvas')]);
  const topbar = el('header', { class: 'topbar' }, [
    el('div', {}, [el('div', { class: 'brand' }, 'DataMaster · Allocator'), el('div', { class: 'sub' }, 'BP & DRE → Plano de Contas (offline)')]),
    el('span', { id: 'empresa-tag', class: 'empresa-tag' }, 'nova análise'),
    el('span', { id: 'balance-badge', class: 'empresa-tag' }, 'A=P+PL: —'),
    el('span', { class: 'spacer' }),
    analisesSel,
    el('button', { class: 'btn', onclick: () => actions.newAnalise() }, 'Nova'),
    el('button', { class: 'btn', onclick: () => actions.save() }, 'Salvar'),
    el('button', { class: 'btn primary', onclick: () => actions.exportExcel() }, 'Exportar Excel'),
  ]);

  // nav
  const nav = el('nav', { class: 'tabs' }, TABS.map((t) => el('button', { id: `tab-${t.id}`, onclick: () => setTab(t.id) }, t.label)));

  // views containers
  const main = el('main');
  for (const t of TABS) { views[t.id] = el('div', { class: 'view', id: `view-${t.id}` }); main.appendChild(views[t.id]); }

  app.appendChild(topbar); app.appendChild(nav); app.appendChild(main);

  await refreshAnalises();
  setTab('header');
  recompute();
}

boot().catch((e) => { console.error(e); document.body.appendChild(el('pre', { style: 'color:red;padding:20px' }, String(e && e.stack || e))); });

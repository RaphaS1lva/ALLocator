// Smoke test das telas com um shim minimo de DOM (sem navegador/npm).
// Exercita renderHeader/Entrada/Shadow/Parecer/Dicionario + patchTipoBadges.

// ---------------- shim de DOM ----------------
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.children = []; this.parent = null; this.attributes = {};
    this.style = {}; this.dataset = {}; this._text = ''; this.value = ''; this.checked = false;
    const set = new Set();
    this.classList = {
      _set: set,
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      toggle: (c, f) => { const on = f === undefined ? !set.has(c) : f; if (on) set.add(c); else set.delete(c); return on; },
      contains: (c) => set.has(c),
    };
  }
  set className(v) { this._class = v; this.classList._set.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList._set.add(c)); }
  get className() { return [...this.classList._set].join(' '); }
  set textContent(v) { this._text = v == null ? '' : String(v); this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = v; }
  appendChild(c) { if (c == null) return c; c.parent = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  get firstChild() { return this.children[0] || null; }
  remove() { if (this.parent) this.parent.removeChild(this); }
  setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener() {}
  _match(sel) {
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('[') && sel.endsWith(']')) { const key = camel(sel.slice(1, -1).replace(/^data-/, '')); return key in this.dataset; }
    return this.tagName === sel.toUpperCase();
  }
  _walk(acc) { for (const c of this.children) { if (c instanceof FakeEl) { acc.push(c); c._walk(acc); } } return acc; }
  querySelector(sel) { return this._walk([]).find((e) => e._match(sel)) || null; }
  querySelectorAll(sel) { return this._walk([]).filter((e) => e._match(sel)); }
}
const document = {
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => ({ _text: String(t), nodeType: 3 }),
  body: new FakeEl('body'),
};
globalThis.document = document;
globalThis.setTimeout = globalThis.setTimeout || ((fn) => fn());

// ---------------- imports (apos o shim) ----------------
const { runPipeline } = await import('../src/core/index.js');
const { renderHeader } = await import('../src/ui/views/header.js');
const { renderEntrada, patchTipoBadges } = await import('../src/ui/views/entrada.js');
const { renderShadow } = await import('../src/ui/views/shadow.js');
const { renderParecer } = await import('../src/ui/views/parecer.js');
const { renderDicionario } = await import('../src/ui/views/dicionario.js');

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const rows = [
  { id: 'a', origem: 'Caixa e bancos', grupo: 'Ativo', subCategoria: 'Circulante', destino: 'Caixa', alocacaoHierarquia: 'Sim', valores: { 2024: 1000 } },
  { id: 'b', origem: 'Fornecedores', grupo: 'Passivo', subCategoria: 'Circulante', destino: 'Fornecedores', alocacaoHierarquia: 'Sim', valores: { 2024: 400 } },
  { id: 'c', origem: 'Capital Social', grupo: 'Passivo', subCategoria: 'PL', destino: 'Capital Social', alocacaoHierarquia: 'Sim', valores: { 2024: 600 } },
];
const result = runPipeline(rows);
const state = {
  header: { empresa: 'Teste SA', cnpj: '1', anos: ['2024'], unidade: 'Mil', moeda: 'BRL' },
  rows, result, dicionario: [
    { origem: 'Caixa', destino: 'Caixa', grupo: 'Ativo', subCategoria: 'Circulante', fonte: 'seed' },
    { origem: 'Duplicatas', destino: 'Clientes', grupo: 'Ativo', subCategoria: 'Circulante', fonte: 'aprendido', id: 'x1' },
  ], _dicLog: [{ ts: new Date().toISOString(), acao: 'novo', origem: 'X', destino: 'Y' }],
};
const actions = new Proxy({}, { get: () => () => {} });
const ctx = { state, actions };

function tryRender(name, fn, container) {
  try { fn(container, ctx); ok(container.children.length > 0, `${name}: gerou conteudo`); }
  catch (e) { fail++; console.log(`  FAIL: ${name} lancou`, e && e.stack || e); }
}

console.log('== render das telas ==');
tryRender('header', renderHeader, new FakeEl('div'));
const cEnt = new FakeEl('div');
tryRender('entrada', renderEntrada, cEnt);
tryRender('shadow', renderShadow, new FakeEl('div'));
tryRender('parecer', renderParecer, new FakeEl('div'));
tryRender('dicionario', renderDicionario, new FakeEl('div'));

console.log('== patchTipoBadges ==');
try { patchTipoBadges(cEnt, result); const tds = cEnt.querySelectorAll('[data-tipocell]'); ok(tds.length === rows.length, `badges por linha (${tds.length})`); }
catch (e) { fail++; console.log('  FAIL patchTipoBadges', e && e.stack || e); }

console.log(`\n== UI SMOKE: ${pass} ok, ${fail} falhas ==`);
process.exit(fail ? 1 : 0);

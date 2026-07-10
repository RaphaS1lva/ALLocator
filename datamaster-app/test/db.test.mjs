// Testa persistencia + dicionario dinamico com um shim minimo de IndexedDB.
// Valida: salvar analise -> aprender dicionario -> memoria da empresa reusa.

// ---------------- shim IndexedDB minimo ----------------
function req(resultFn) {
  const r = { onsuccess: null, onerror: null, result: undefined };
  setTimeout(() => { try { r.result = resultFn(); r.onsuccess && r.onsuccess({ target: r }); } catch (e) { r.error = e; r.onerror && r.onerror({ target: r }); } }, 0);
  return r;
}
class Store {
  constructor(keyPath, autoInc) { this.keyPath = keyPath; this.autoInc = autoInc; this.map = new Map(); this.seq = 0; }
  getAll() { return req(() => [...this.map.values()]); }
  get(k) { return req(() => this.map.get(k) ?? null); }
  put(v) { return req(() => { if (this.autoInc && v[this.keyPath] == null) v[this.keyPath] = ++this.seq; this.map.set(v[this.keyPath], v); return v[this.keyPath]; }); }
  delete(k) { return req(() => { this.map.delete(k); return undefined; }); }
  createIndex() {}
}
class DB {
  constructor() { this.stores = new Map(); this.objectStoreNames = { contains: (n) => this.stores.has(n) }; }
  createObjectStore(name, opts = {}) { const s = new Store(opts.keyPath || 'id', !!opts.autoIncrement); this.stores.set(name, s); return s; }
  transaction(name) { const self = this; return { objectStore: (n) => self.stores.get(n) }; }
}
globalThis.indexedDB = {
  open() {
    const r = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null };
    const db = new DB();
    setTimeout(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded({ target: { result: db } }); r.onsuccess && r.onsuccess({ target: r }); }, 0);
    return r;
  },
};

// ---------------- teste ----------------
const { createRepository } = await import('../src/db/repository.js');
const { runPipeline } = await import('../src/core/index.js');

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const repo = createRepository();
await repo.init();

const dicAntes = await repo.getDicionario();
console.log('dicionario seed:', dicAntes.length);

// Analise 1: aloca "Recebiveis de clientes" -> "Clientes" (manual do analista)
const rows1 = runPipeline([
  { origem: 'Recebiveis de clientes XPTO', grupo: 'Ativo', subCategoria: 'Circulante', destino: 'Clientes', alocacaoHierarquia: 'Sim', valores: { 2024: 500 } },
  { origem: 'Caixa', grupo: 'Ativo', subCategoria: 'Circulante', destino: 'Caixa', alocacaoHierarquia: 'Sim', valores: { 2024: 100 } },
]).rows;
const saved = await repo.saveAnalise({ empresa: 'ACME', cnpj: '111', rows: rows1, anos: ['2024'] });
ok(!!saved.id, 'analise salva com id');

const dicDepois = await repo.getDicionario();
console.log('dicionario apos aprender:', dicDepois.length);
const aprendida = dicDepois.find((d) => d.origem === 'Recebiveis de clientes XPTO');
ok(!!aprendida, 'dicionario aprendeu "Recebiveis de clientes XPTO"');
ok(aprendida && aprendida.destino === 'Clientes', 'aprendeu destino correto (Clientes)');
ok(aprendida && aprendida.fonte === 'aprendido', 'fonte = aprendido');

const log = await repo.listLog();
ok(log.length >= 1, `log de aprendizado (${log.length})`);

// Memoria da empresa reusa: nova analise, mesma origem SEM destino -> deve casar
const mem = await repo.getCompanyMemory('111');
ok(mem.length >= 2, `memoria da empresa (${mem.length} entradas)`);
const res2 = runPipeline([
  { origem: 'Recebiveis de clientes XPTO', grupo: 'Ativo', subCategoria: 'Circulante', alocacaoHierarquia: 'Sim', valores: { 2025: 700 } },
], { companyMemory: mem });
const r2 = res2.rows[0];
ok(r2.destino === 'Clientes', `memoria reusou destino (${r2.destino})`);
ok(r2.tipoMapeamento === 'Memoria Anterior', `tipo = Memoria Anterior (${r2.tipoMapeamento})`);

// Dicionario dinamico tambem serve para outra empresa (aprendizado global)
const res3 = runPipeline([
  { origem: 'Recebiveis de clientes XPTO', grupo: 'Ativo', subCategoria: 'Circulante', alocacaoHierarquia: 'Sim', valores: { 2025: 300 } },
], { dicionario: dicDepois });
ok(res3.rows[0].destino === 'Clientes', 'dicionario global reusa a regra aprendida');

console.log(`\n== DB TEST: ${pass} ok, ${fail} falhas ==`);
process.exit(fail ? 1 : 0);

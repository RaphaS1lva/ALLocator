// Adaptador IndexedDB (offline, sem dependencias). Implementa o contrato do
// repository.js. Guarda analises, dicionario aprendido/manual e log de mudancas.
import { DICIONARIO_SEED } from '../data/dicionario.seed.js';
import { normalizeText } from '../core/normalize.js';
import { dicChave, entriesFromRows } from './repository.js';

const DB_NAME = 'datamaster';
const DB_VERSION = 1;
const STORES = { analises: 'analises', dicionario: 'dicionario', log: 'dicionario_log' };

function uid() {
  return (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export class IndexedDBRepository {
  constructor() { this.db = null; }

  init() {
    if (this.db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.analises)) {
          db.createObjectStore(STORES.analises, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.dicionario)) {
          const s = db.createObjectStore(STORES.dicionario, { keyPath: 'id' });
          s.createIndex('chave', 'chave', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.log)) {
          db.createObjectStore(STORES.log, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  _tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  _all(store) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  _put(store, value) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  }

  _get(store, key) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  _delete(store, key) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ---------- Analises ----------
  async listAnalises() {
    const all = await this._all(STORES.analises);
    return all
      .map(({ rows, ...meta }) => ({ ...meta, nLinhas: (rows || []).length }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  getAnalise(id) { return this._get(STORES.analises, id); }

  async saveAnalise(analise) {
    const now = new Date().toISOString();
    const rec = {
      ...analise,
      id: analise.id || uid(),
      createdAt: analise.createdAt || now,
      updatedAt: now,
    };
    await this._put(STORES.analises, rec);
    // Dicionario dinamico AUTOMATICO: aprende com as linhas alocadas.
    await this.learnFromRows(rec.rows, rec.id);
    return rec;
  }

  deleteAnalise(id) { return this._delete(STORES.analises, id); }

  // ---------- Dicionario ----------
  async getLearnedDicionario() {
    return this._all(STORES.dicionario);
  }

  async getDicionario() {
    const learned = await this._all(STORES.dicionario);
    // seed + aprendido; aprendido/manual sobrescreve seed na mesma chave
    const byChave = new Map();
    for (const e of DICIONARIO_SEED) {
      byChave.set(dicChave(e.origem, e.grupo, e.subCategoria), { ...e, fonte: 'seed' });
    }
    for (const e of learned) {
      byChave.set(e.chave, {
        origem: e.origem, destino: e.destino, grupo: e.grupo, subCategoria: e.subCategoria, fonte: e.fonte,
      });
    }
    return [...byChave.values()];
  }

  async upsertDicionarioEntry(entry) {
    const chave = dicChave(entry.origem, entry.grupo, entry.subCategoria);
    const existing = (await this._all(STORES.dicionario)).find((x) => x.chave === chave);
    const rec = {
      id: existing ? existing.id : uid(),
      chave,
      origem: String(entry.origem).trim(),
      origemNorm: normalizeText(entry.origem),
      destino: String(entry.destino).trim(),
      grupo: String(entry.grupo || '').trim(),
      subCategoria: String(entry.subCategoria || '').trim(),
      fonte: entry.fonte || 'manual',
      freq: (existing ? existing.freq || 1 : 0) + (entry.incrementFreq ? 1 : 1),
      updatedAt: new Date().toISOString(),
    };
    await this._put(STORES.dicionario, rec);
    return rec;
  }

  deleteDicionarioEntry(id) { return this._delete(STORES.dicionario, id); }

  async learnFromRows(rows, analiseId) {
    const entries = entriesFromRows(rows);
    let n = 0;
    for (const e of entries) {
      const chave = dicChave(e.origem, e.grupo, e.subCategoria);
      const existing = (await this._all(STORES.dicionario)).find((x) => x.chave === chave);
      // aprende quando e novo OU quando muda o destino (registro do trabalho manual)
      if (!existing || normalizeText(existing.destino) !== normalizeText(e.destino)) {
        await this.upsertDicionarioEntry({ ...e, fonte: 'aprendido', incrementFreq: true });
        await this._put(STORES.log, {
          ts: new Date().toISOString(),
          acao: existing ? 'atualizado' : 'novo',
          origem: e.origem, destino: e.destino, grupo: e.grupo, subCategoria: e.subCategoria,
          analiseId: analiseId || null,
        });
        n += 1;
      } else {
        // reforca frequencia
        await this.upsertDicionarioEntry({ ...e, fonte: existing.fonte || 'aprendido', incrementFreq: true });
      }
    }
    return n;
  }

  async getCompanyMemory(cnpj) {
    if (!cnpj) return [];
    const all = await this._all(STORES.analises);
    const mem = new Map();
    for (const a of all) {
      if (normalizeText(a.cnpj) !== normalizeText(cnpj)) continue;
      for (const e of entriesFromRows(a.rows)) {
        mem.set(dicChave(e.origem, e.grupo, e.subCategoria), e);
      }
    }
    return [...mem.values()];
  }

  async listLog(limit = 200) {
    const all = await this._all(STORES.log);
    return all.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, limit);
  }
}

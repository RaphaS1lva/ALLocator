// Adaptador Supabase via REST (PostgREST) usando fetch — SEM o pacote npm
// @supabase/supabase-js (que o proxy corporativo bloqueia). Mesmo contrato do
// IndexedDBRepository. Use quando migrar para outra maquina/rede:
//   createRepository({ backend:'supabase', supabase:{ url, anonKey } })
// O aprendizado do dicionario e feito por TRIGGER no banco (schema.sql),
// mas tambem reforcado aqui client-side por idempotencia.
import { DICIONARIO_SEED } from '../data/dicionario.seed.js';
import { normalizeText } from '../core/normalize.js';
import { dicChave, entriesFromRows } from './repository.js';

export class SupabaseRepository {
  constructor(cfg = {}) {
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase requer { url, anonKey }');
    this.base = `${cfg.url.replace(/\/$/, '')}/rest/v1`;
    this.key = cfg.anonKey;
  }

  init() { return Promise.resolve(); }

  _headers(extra = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async _req(path, { method = 'GET', body, prefer } = {}) {
    const headers = this._headers(prefer ? { Prefer: prefer } : {});
    const res = await fetch(`${this.base}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${await res.text()}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  // ---------- Analises ----------
  async listAnalises() {
    const rows = await this._req('/analises?select=id,empresa,cnpj,grupo,modelo,unidade,moeda,anos,updated_at&order=updated_at.desc');
    return (rows || []).map((r) => ({ ...r, updatedAt: r.updated_at }));
  }

  async getAnalise(id) {
    const rows = await this._req(`/analises?id=eq.${encodeURIComponent(id)}&select=*`);
    return rows && rows[0] ? rows[0] : null;
  }

  async saveAnalise(analise) {
    const now = new Date().toISOString();
    const rec = { ...analise, id: analise.id || crypto.randomUUID(), updated_at: now };
    const out = await this._req('/analises', {
      method: 'POST', body: rec, prefer: 'resolution=merge-duplicates,return=representation',
    });
    // Reforco client-side (idempotente) — caso o trigger nao esteja instalado.
    await this.learnFromRows(rec.rows, rec.id);
    return (out && out[0]) || rec;
  }

  deleteAnalise(id) {
    return this._req(`/analises?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ---------- Dicionario ----------
  getLearnedDicionario() { return this._req('/dicionario?select=*'); }

  async getDicionario() {
    const learned = (await this.getLearnedDicionario()) || [];
    const byChave = new Map();
    for (const e of DICIONARIO_SEED) byChave.set(dicChave(e.origem, e.grupo, e.subCategoria), { ...e, fonte: 'seed' });
    for (const e of learned) {
      byChave.set(e.chave, {
        origem: e.origem, destino: e.destino, grupo: e.grupo, subCategoria: e.sub_categoria, fonte: e.fonte,
      });
    }
    return [...byChave.values()];
  }

  upsertDicionarioEntry(entry) {
    const rec = {
      chave: dicChave(entry.origem, entry.grupo, entry.subCategoria),
      origem: String(entry.origem).trim(),
      origem_norm: normalizeText(entry.origem),
      destino: String(entry.destino).trim(),
      grupo: String(entry.grupo || '').trim(),
      sub_categoria: String(entry.subCategoria || '').trim(),
      fonte: entry.fonte || 'manual',
      updated_at: new Date().toISOString(),
    };
    return this._req('/dicionario', {
      method: 'POST', body: rec, prefer: 'resolution=merge-duplicates,return=representation',
    });
  }

  deleteDicionarioEntry(id) {
    return this._req(`/dicionario?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async learnFromRows(rows, analiseId) {
    const entries = entriesFromRows(rows);
    for (const e of entries) await this.upsertDicionarioEntry({ ...e, fonte: 'aprendido' });
    return entries.length;
  }

  async getCompanyMemory(cnpj) {
    if (!cnpj) return [];
    const rows = await this._req(`/analises?cnpj=eq.${encodeURIComponent(cnpj)}&select=rows`);
    const mem = new Map();
    for (const a of rows || []) {
      for (const e of entriesFromRows(a.rows)) mem.set(dicChave(e.origem, e.grupo, e.subCategoria), e);
    }
    return [...mem.values()];
  }

  listLog(limit = 200) {
    return this._req(`/dicionario_log?select=*&order=ts.desc&limit=${limit}`);
  }
}

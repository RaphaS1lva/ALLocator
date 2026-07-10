// Repositório de dados do portal.
// - Supabase configurado -> Postgres com RLS (multiusuário real).
// - Sem Supabase -> modo demo com localStorage (para desenvolvimento/apresentação offline).
//
// MEMÓRIA ANTERIOR (regra de negócio): não usamos mais Excel reenviado.
// A memória anterior de um cliente é a FOTO DO ÚLTIMO PLANILHAMENTO salvo
// (análise mais recente daquele cliente no banco) -> getCompanyMemory().
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { DICIONARIO_SEED } from '../data/dicionario.seed.js';
import { normalizeText } from '../core/normalize.js';

export function dicChave(origem, grupo, subCategoria) {
  return [normalizeText(origem), normalizeText(grupo), normalizeText(subCategoria)].join('|');
}

/** Entradas de dicionário a partir de linhas alocadas (Alocação=Sim com destino). */
export function entriesFromRows(rows) {
  const out = [];
  for (const r of rows || []) {
    if (r.alocacaoHierarquia !== 'Sim') continue;
    if (!r.destino || !String(r.destino).trim()) continue;
    out.push({
      origem: String(r.origem).trim(),
      destino: String(r.destino).trim(),
      grupo: String(r.grupo || '').trim(),
      subCategoria: String(r.subCategoria || '').trim(),
    });
  }
  return out;
}

/* ============================ Supabase ============================ */

class SupabaseRepo {
  constructor() { this.mode = 'supabase'; }

  async listClientes() {
    const { data, error } = await supabase.from('clientes').select('*').order('nome');
    if (error) throw error;
    return data || [];
  }

  async upsertCliente(cliente) {
    const { data: userData } = await supabase.auth.getUser();
    const rec = {
      id: cliente.id || undefined,
      nome: cliente.nome, cnpj: cliente.cnpj || '', grupo: cliente.grupo || '',
      setor: cliente.setor || '', user_id: userData?.user?.id,
    };
    const { data, error } = await supabase.from('clientes').upsert(rec).select().single();
    if (error) throw error;
    return data;
  }

  async deleteCliente(id) {
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) throw error;
  }

  async listAnalises() {
    const { data, error } = await supabase
      .from('analises')
      .select('id,cliente_id,empresa,cnpj,status,unidade,moeda,anos,n_linhas,balanco_fechado,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getAnalise(id) {
    const { data, error } = await supabase.from('analises').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async saveAnalise(analise) {
    const { data: userData } = await supabase.auth.getUser();
    const rec = { ...analise, user_id: userData?.user?.id, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('analises').upsert(rec).select().single();
    if (error) throw error;
    await this.learnFromRows(rec.rows, data.id);
    return data;
  }

  async deleteAnalise(id) {
    const { error } = await supabase.from('analises').delete().eq('id', id);
    if (error) throw error;
  }

  /** Memória anterior = linhas alocadas da ÚLTIMA análise concluída do cliente. */
  async getCompanyMemory(clienteId, cnpj) {
    let q = supabase.from('analises')
      .select('rows,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    else if (cnpj) q = q.eq('cnpj', cnpj);
    else return [];
    const { data, error } = await q;
    if (error || !data?.length) return [];
    return entriesFromRows(data[0].rows);
  }

  async getDicionario() {
    const { data } = await supabase.from('dicionario').select('*');
    const byChave = new Map();
    for (const e of DICIONARIO_SEED) byChave.set(dicChave(e.origem, e.grupo, e.subCategoria), { ...e, fonte: 'seed' });
    for (const e of data || []) {
      byChave.set(e.chave, {
        id: e.id, origem: e.origem, destino: e.destino, grupo: e.grupo,
        subCategoria: e.sub_categoria, fonte: e.fonte,
      });
    }
    return [...byChave.values()];
  }

  async upsertDicionarioEntry(entry) {
    const { data: userData } = await supabase.auth.getUser();
    const rec = {
      chave: dicChave(entry.origem, entry.grupo, entry.subCategoria),
      origem: String(entry.origem).trim(),
      origem_norm: normalizeText(entry.origem),
      destino: String(entry.destino).trim(),
      grupo: String(entry.grupo || '').trim(),
      sub_categoria: String(entry.subCategoria || '').trim(),
      fonte: entry.fonte || 'manual',
      user_id: userData?.user?.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('dicionario').upsert(rec, { onConflict: 'chave' });
    if (error) throw error;
  }

  async deleteDicionarioEntry(id) {
    const { error } = await supabase.from('dicionario').delete().eq('id', id);
    if (error) throw error;
  }

  async learnFromRows(rows, analiseId) {
    const entries = entriesFromRows(rows);
    for (const e of entries) {
      try { await this.upsertDicionarioEntry({ ...e, fonte: 'aprendido' }); } catch { /* idempotente */ }
    }
    return entries.length;
  }
}

/* ============================ Demo (localStorage) ============================ */

const LS = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`dm:${key}`)) ?? fallback; } catch { return fallback; }
  },
  write(key, value) { localStorage.setItem(`dm:${key}`, JSON.stringify(value)); },
};
const uid = () => crypto.randomUUID();

class DemoRepo {
  constructor() { this.mode = 'demo'; }

  async listClientes() { return LS.read('clientes', []); }

  async upsertCliente(cliente) {
    const list = LS.read('clientes', []);
    const rec = { ...cliente, id: cliente.id || uid() };
    const i = list.findIndex((c) => c.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    LS.write('clientes', list);
    return rec;
  }

  async deleteCliente(id) { LS.write('clientes', LS.read('clientes', []).filter((c) => c.id !== id)); }

  async listAnalises() {
    return LS.read('analises', [])
      .map(({ rows, ...meta }) => meta)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  async getAnalise(id) { return LS.read('analises', []).find((a) => a.id === id) || null; }

  async saveAnalise(analise) {
    const list = LS.read('analises', []);
    const rec = { ...analise, id: analise.id || uid(), updated_at: new Date().toISOString() };
    const i = list.findIndex((a) => a.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    LS.write('analises', list);
    await this.learnFromRows(rec.rows, rec.id);
    return rec;
  }

  async deleteAnalise(id) { LS.write('analises', LS.read('analises', []).filter((a) => a.id !== id)); }

  async getCompanyMemory(clienteId, cnpj) {
    const list = LS.read('analises', [])
      .filter((a) => (clienteId ? a.cliente_id === clienteId : cnpj && a.cnpj === cnpj))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return list.length ? entriesFromRows(list[0].rows) : [];
  }

  async getDicionario() {
    const learned = LS.read('dicionario', []);
    const byChave = new Map();
    for (const e of DICIONARIO_SEED) byChave.set(dicChave(e.origem, e.grupo, e.subCategoria), { ...e, fonte: 'seed' });
    for (const e of learned) byChave.set(e.chave, e);
    return [...byChave.values()];
  }

  async upsertDicionarioEntry(entry) {
    const learned = LS.read('dicionario', []);
    const chave = dicChave(entry.origem, entry.grupo, entry.subCategoria);
    const rec = { id: uid(), chave, ...entry, fonte: entry.fonte || 'manual' };
    const i = learned.findIndex((e) => e.chave === chave);
    if (i >= 0) learned[i] = { ...learned[i], ...rec, id: learned[i].id }; else learned.push(rec);
    LS.write('dicionario', learned);
  }

  async deleteDicionarioEntry(id) { LS.write('dicionario', LS.read('dicionario', []).filter((e) => e.id !== id)); }

  async learnFromRows(rows) {
    const entries = entriesFromRows(rows);
    for (const e of entries) await this.upsertDicionarioEntry({ ...e, fonte: 'aprendido' });
    return entries.length;
  }
}

export function createRepo() {
  return isSupabaseConfigured ? new SupabaseRepo() : new DemoRepo();
}

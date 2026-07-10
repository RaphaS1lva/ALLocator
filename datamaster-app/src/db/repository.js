// Camada de persistencia — interface unica com adaptadores plugaveis.
// Padrao: IndexedDB (offline, roda aqui). Futuro: Supabase (REST/fetch).
// A "chave" do dicionario e Origem(normalizada)|Grupo|Sub Categoria.
import { normalizeText } from '../core/normalize.js';
import { IndexedDBRepository } from './indexeddb.js';
import { SupabaseRepository } from './supabase.js';

/** Chave de deduplicacao do dicionario dinamico. */
export function dicChave(origem, grupo, subCategoria) {
  return [normalizeText(origem), normalizeText(grupo), normalizeText(subCategoria)].join('|');
}

/**
 * Extrai entradas de dicionario a partir de linhas alocadas (Alocacao='Sim'
 * com destino). Base do "dicionario dinamico" — aprende com o trabalho manual.
 */
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

/**
 * Fabrica do repositorio.
 * @param {object} [config]
 *   backend: 'indexeddb' | 'supabase' (default 'indexeddb')
 *   supabase: { url, anonKey }  (necessario p/ backend 'supabase')
 */
export function createRepository(config = {}) {
  const backend = config.backend
    || (config.supabase && config.supabase.url ? 'supabase' : 'indexeddb');
  if (backend === 'supabase') return new SupabaseRepository(config.supabase);
  return new IndexedDBRepository(config.indexeddb);
}

/*
 * Contrato (todas as adaptadoras implementam, assinaturas assincronas):
 *   init()                                  -> Promise<void>
 *   listAnalises()                          -> Promise<Analise[]> (sem rows)
 *   getAnalise(id)                          -> Promise<Analise|null>
 *   saveAnalise(analise)                    -> Promise<Analise>  (upsert + aprende dicionario)
 *   deleteAnalise(id)                       -> Promise<void>
 *   getDicionario()                         -> Promise<Entry[]>  (seed + aprendido/manual)
 *   getLearnedDicionario()                  -> Promise<Entry[]>  (so aprendido/manual)
 *   upsertDicionarioEntry(entry)            -> Promise<Entry>
 *   deleteDicionarioEntry(id)               -> Promise<void>
 *   learnFromRows(rows, analiseId)          -> Promise<number>   (qtde aprendida)
 *   getCompanyMemory(cnpj)                  -> Promise<Entry[]>  (memoria anterior p/ matching)
 *   listLog(limit)                          -> Promise<LogEntry[]>
 */

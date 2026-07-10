// Cliente da API de IA (FastAPI em Hugging Face Spaces / Render).
// Todas as chamadas de LLM passam pelo backend — as chaves NUNCA ficam no
// frontend (GitHub Pages é código público). Se a API não estiver configurada
// ou fora do ar, o portal degrada graciosamente para o modo determinístico.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const isApiConfigured = Boolean(API_URL);

async function req(path, { method = 'GET', body, formData, timeoutMs = 120000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: formData ? undefined : { 'Content-Type': 'application/json' },
      body: formData || (body ? JSON.stringify(body) : undefined),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`API ${method} ${path}: ${res.status} ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  /** Verifica se a API está no ar e quais provedores de LLM estão ativos. */
  health: () => req('/health', { timeoutMs: 8000 }),

  /** Consumo de tokens/requisições por provedor + limites de referência. */
  usage: () => req('/usage', { timeoutMs: 8000 }),

  /**
   * Extração de documento escaneado/imagem via LLM de visão.
   * @param {File} file
   * @returns {{rows:[], meta:{anos,unidade,moeda,isBalancete,paginas}}}
   */
  async extract(file) {
    const fd = new FormData();
    fd.append('file', file);
    // documentos grandes + free tier sob rate limit podem levar vários
    // minutos (retries em cascata) — o timeout precisa cobrir o pior caso
    return req('/extract', { method: 'POST', formData: fd, timeoutMs: 720000 });
  },

  /**
   * Sugestões julgamentais em LOTE para linhas sem destino.
   * @param {Array} rows linhas {origem, hierarquia, grupo, subCategoria, codigo}
   * @param {Array} planoContas contas alocáveis {destino, grupo, subCategoria}
   * @returns {{suggestions:[{origem, destino, grupo, subCategoria, justificativa}]}}
   */
  julgamental: (rows, planoContas) => req('/julgamental', { method: 'POST', body: { rows, plano_contas: planoContas } }),

  /**
   * Parecer final em linguagem natural.
   * @returns {{parecer: string, provider: string}}
   */
  parecer: (resumo) => req('/parecer', { method: 'POST', body: resumo }),
};

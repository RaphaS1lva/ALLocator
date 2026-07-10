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
  /**
   * Extração como JOB assíncrono: o POST devolve job_id na hora (sobrevive
   * aos proxies de host gratuito, que matam requisições longas) e o portal
   * consulta o progresso a cada 4s.
   * @param {File} file
   * @param {(msg: string) => void} [onProgress] mensagens de progresso ao vivo
   */
  async extract(file, onProgress) {
    const fd = new FormData();
    fd.append('file', file);
    const start = await req('/extract', { method: 'POST', formData: fd, timeoutMs: 120000 });
    if (start.rows) return start; // retrocompatível com API síncrona antiga
    const jobId = start.job_id;
    if (!jobId) throw new Error('API não retornou job de extração.');
    const t0 = Date.now();
    const LIMITE = 15 * 60 * 1000;
    while (Date.now() - t0 < LIMITE) {
      await new Promise((r) => setTimeout(r, 4000));
      let st;
      try {
        st = await req(`/extract/${jobId}`, { timeoutMs: 20000 });
      } catch {
        continue; // oscilação de rede não mata o acompanhamento
      }
      if (st.status === 'done') return st.result;
      if (st.status === 'error') throw new Error(st.detail || 'Falha na extração.');
      if (onProgress && st.progress) onProgress(st.progress);
    }
    throw new Error('Tempo esgotado aguardando a extração (15 min).');
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

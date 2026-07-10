// Mapeamento de colunas importadas -> linhas do grid. Auto-detecta cabecalhos
// e colunas de ano; converte codigo contabil em grupo quando faltar (§8.7).
import { normalizeText, coerceNumber } from '../core/normalize.js';
import { grupoFromCodigo } from '../core/sign.js';

const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `imp_${Date.now()}_${Math.random().toString(36).slice(2)}`);

// sinonimos de cabecalho por campo (normalizados)
const SYNONYMS = {
  origem: ['origem', 'conta', 'descricao', 'descricao da conta', 'historico', 'nome', 'rubrica', 'conta contabil'],
  codigo: ['codigo', 'cod', 'classificacao', 'conta reduzida', 'nro conta'],
  hierarquia: ['hierarquia', 'pai', 'conta pai', 'grupo pai', 'totalizador'],
  paginaReferencia: ['pagina', 'pag', 'pagina referencia', 'pagina de referencia', 'ref'],
  grupo: ['grupo', 'natureza', 'tipo'],
  subCategoria: ['sub categoria', 'subcategoria', 'sub', 'subgrupo'],
  destino: ['destino', 'destino no template', 'conta destino', 'plano de contas'],
  alocacaoHierarquia: ['alocacao da hierarquia', 'alocacao', 'aloca', 'alocar'],
};

function yearFromHeader(h) {
  const m = String(h).match(/(19|20)\d{2}/g);
  if (m && m.length) return m[m.length - 1];
  return null;
}

/** Detecta o mapeamento a partir do cabecalho (array de strings). */
export function autoGuessMapping(header) {
  const norm = header.map((h) => normalizeText(h));
  const fields = {};
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    let idx = -1;
    // match exato primeiro
    idx = norm.findIndex((h) => syns.includes(h));
    if (idx < 0) idx = norm.findIndex((h) => h && syns.some((s) => h.includes(s)));
    if (idx >= 0) fields[field] = idx;
  }
  // colunas de ano: cabecalhos com um ano de 4 digitos
  const yearCols = [];
  header.forEach((h, i) => {
    if (Object.values(fields).includes(i)) return;
    const y = yearFromHeader(h);
    if (y) yearCols.push({ col: i, ano: y });
  });
  return { fields, yearCols };
}

/** Anos efetivos (ate 3 mais recentes) a partir das colunas de ano. */
export function effectiveYears(yearCols) {
  const anos = [...new Set(yearCols.map((y) => String(y.ano)))].sort();
  return anos.length > 3 ? anos.slice(anos.length - 3) : anos;
}

/**
 * Constroi as linhas do grid a partir da tabela + mapeamento.
 * @param {Array<Array>} table  linhas (inclui cabecalho em headerRow)
 * @param {object} mapping      { fields, yearCols }
 * @param {object} [opts]       { headerRow=0, alocacaoPadrao='Sim' }
 * @returns {{rows:Array, anos:Array}}
 */
export function buildEntryRows(table, mapping, opts = {}) {
  const headerRow = opts.headerRow ?? 0;
  const alocPad = opts.alocacaoPadrao ?? 'Sim';
  const { fields, yearCols } = mapping;
  const anos = effectiveYears(yearCols);
  const anoByCol = new Map(yearCols.filter((y) => anos.includes(String(y.ano))).map((y) => [y.col, String(y.ano)]));

  const get = (row, field) => (fields[field] != null ? row[fields[field]] : undefined);
  const rows = [];
  for (let i = headerRow + 1; i < table.length; i++) {
    const row = table[i] || [];
    const origem = String(get(row, 'origem') ?? '').trim();
    if (!origem || isNoiseOrigem(origem)) continue;

    let grupo = String(get(row, 'grupo') ?? '').trim();
    const codigo = String(get(row, 'codigo') ?? '').trim();
    if (!grupo && codigo) { const g = grupoFromCodigo(codigo); if (g) grupo = g.grupo; }

    const valores = {};
    for (const [col, ano] of anoByCol) {
      const v = row[col];
      if (v !== undefined && v !== null && String(v).trim() !== '') valores[ano] = v;
    }

    const alocRaw = get(row, 'alocacaoHierarquia');
    const aloc = alocRaw != null && String(alocRaw).trim() !== ''
      ? (normalizeText(alocRaw) === 'sim' ? 'Sim' : 'Não') : alocPad;

    rows.push({
      id: uid(),
      origem,
      hierarquia: String(get(row, 'hierarquia') ?? '').trim(),
      paginaReferencia: String(get(row, 'paginaReferencia') ?? '').trim(),
      codigo,
      grupo,
      subCategoria: String(get(row, 'subCategoria') ?? '').trim(),
      destino: String(get(row, 'destino') ?? '').trim(),
      alocacaoHierarquia: aloc,
      tipoMapeamento: '',
      valores,
    });
  }
  return { rows, anos };
}

// Padrões de RUÍDO que não são contas (datas, CPF/CNPJ, índices, assinaturas).
const NOISE_RE = [
  /\bcpf\b|\bcnpj\b/i,
  /\d{2}\.\d{3}\.\d{3}\/\d{4}/,                       // CNPJ
  /\d{3}\.\d{3}\.\d{3}\s*-?\s*\d{2}/,                 // CPF
  /liquidez|solv[eê]ncia|[íi]ndice|endividamento|rentabilidade|margem\s+l[íi]quida/i,
  /=/,                                                // linhas de razão "= 1,70 ="
  /\bde\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i,
  /s[ãa]o\s+paulo|assinad|contador|crc\b|diretor|p[áa]gina\b/i,
];
// Cabeçalhos de seção e TOTAIS (normalizados) — não são contas alocáveis.
const NOISE_EXACT = new Set([
  'ativo', 'passivo', 'ac', 'pc', 'anc', 'pnc', 'ac anc', 'pc pnc',
  'ativo total', 'passivo total', 'total do ativo', 'total do passivo', 'total',
  'total ativo', 'total passivo', 'ativo circulante', 'passivo circulante',
  'ativo nao circulante', 'passivo nao circulante', 'circulante', 'nao circulante',
  'balanco patrimonial', 'demonstracao de resultados', 'demonstracao do resultado',
  'ativo e passivo', 'total do ativo e passivo',
]);

/** true se a "origem" extraída é ruído (não é uma conta real). */
export function isNoiseOrigem(name) {
  const raw = String(name || '').trim();
  if (!raw) return true;
  const norm = normalizeText(raw);
  if (!norm) return true;
  if (NOISE_EXACT.has(norm)) return true;
  if (norm.replace(/[^a-z]/g, '').length < 3) return true;   // "AC", "PC", siglas
  return NOISE_RE.some((re) => re.test(raw));
}

/** true se a celula parece um numero (valor), com ao menos um digito. */
export function looksNumeric(v) {
  if (v == null || String(v).trim() === '') return false;
  const n = coerceNumber(v);
  return typeof n === 'number' && /\d/.test(String(v));
}

/** Procura nas primeiras linhas uma que contenha 1-3 anos (4 dígitos). */
export function detectYears(rows) {
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const ys = (rows[r] || []).map((c) => { const m = String(c).match(/(19|20)\d{2}/); return m ? m[0] : null; }).filter(Boolean);
    const uniq = [...new Set(ys)];
    if (uniq.length >= 1 && uniq.length <= 3) return { row: r, anos: uniq };
  }
  return null;
}

/**
 * Auto-detecta como importar SEM intervenção manual.
 * mode='header'  -> há cabeçalho reconhecível (usa autoGuessMapping)
 * mode='positional' -> sem cabeçalho: nome à esquerda + números à direita (PDF)
 */
export function autoDetect(rows, existingAnos) {
  let best = null;
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const g = autoGuessMapping((rows[r] || []).map((h) => String(h ?? '')));
    const score = Object.keys(g.fields).length + g.yearCols.length * 2 + (g.fields.origem != null ? 3 : 0);
    if (!best || score > best.score) best = { row: r, g, score };
  }
  if (best && best.g.fields.origem != null) {
    return { mode: 'header', headerRow: best.row, mapping: best.g, anos: effectiveYears(best.g.yearCols), confident: true };
  }
  const yr = detectYears(rows);
  const anos = yr ? yr.anos : ((existingAnos && existingAnos.length) ? existingAnos : []);
  return { mode: 'positional', headerRow: yr ? yr.row : -1, anos, confident: true };
}

/**
 * Constrói linhas POSICIONALMENTE (sem cabeçalho): em cada linha, o texto à
 * esquerda vira Origem e os números à direita viram valores por ano (alinhados
 * à direita). Ideal para PDF/planilhas sem cabeçalho de campos. Ignora linhas
 * sem nenhum número (títulos/seções). Grupo/Sub ficam vazios e são preenchidos
 * pelo dicionário na alocação automática.
 */
export function buildRowsPositional(rows, opts = {}) {
  const start = (opts.headerRow != null && opts.headerRow >= 0) ? opts.headerRow + 1 : 0;
  const alocPad = opts.alocacaoPadrao ?? 'Sim';
  const tmp = [];
  let maxVals = 0;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    // tokeniza (achata células + separa por espaços) — robusto p/ texto colado do PDF
    const tokens = row.flatMap((c) => String(c ?? '').split(/\s+/)).filter((t) => t !== '');
    if (!tokens.length) continue;
    // valores = tokens numéricos CONTÍGUOS no fim da linha (nome vem antes)
    let end = tokens.length; const vals = [];
    while (end > 0 && looksNumeric(tokens[end - 1])) { vals.unshift(tokens[end - 1]); end -= 1; }
    if (!vals.length) continue;                // linha sem números à direita -> título/seção
    const origem = tokens.slice(0, end).join(' ').trim();
    if (!origem || isNoiseOrigem(origem)) continue; // ruído (data/CPF/índice/seção/total)
    const use = vals.length > 3 ? vals.slice(vals.length - 3) : vals;
    maxVals = Math.max(maxVals, use.length);
    tmp.push({ origem, vals: use });
  }
  // Nº de colunas vem dos DADOS (evita perder valores). Usa os anos detectados
  // só quando a quantidade bate; senão rótulos genéricos (o usuário renomeia no Cabeçalho).
  const nCols = Math.min(maxVals, 3);
  const anos = (opts.anos && opts.anos.length === nCols)
    ? opts.anos.slice(0, 3)
    : Array.from({ length: nCols }, (_, k) => `Ano ${k + 1}`);
  const out = tmp.map((t) => {
    const valores = {};
    const use = t.vals.length > anos.length ? t.vals.slice(t.vals.length - anos.length) : t.vals;
    const offset = anos.length - use.length;
    use.forEach((v, k) => { const ano = anos[offset + k]; if (ano != null) valores[ano] = v; });
    return {
      id: uid(), origem: t.origem, hierarquia: '', paginaReferencia: '', codigo: '',
      grupo: '', subCategoria: '', destino: '', alocacaoHierarquia: alocPad, tipoMapeamento: '', valores,
    };
  });
  return { rows: out, anos };
}

export const IMPORT_FIELDS = [
  ['origem', 'Origem *'], ['codigo', 'Código contábil'], ['hierarquia', 'Hierarquia (pai)'],
  ['paginaReferencia', 'Página'], ['grupo', 'Grupo'], ['subCategoria', 'Sub Categoria'],
  ['destino', 'Destino no Template'], ['alocacaoHierarquia', 'Alocação (Sim/Não)'],
];

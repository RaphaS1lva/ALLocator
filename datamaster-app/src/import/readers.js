// Dispatcher de leitura por formato. xlsx/xlsm -> OOXML; csv/tsv/paste ->
// delimitado; xls -> erro amigavel; pdf/imagem -> hook de OCR plugavel.
import { readXlsx } from './xlsx-read.js';
import { extractPdfText } from './pdf-text.js';
import { looksNumeric } from './mapping.js';

// Qualidade da extração de PDF: fração de linhas com um nome (>=3 letras) E um número.
function pdfQuality(rows) {
  if (!rows || !rows.length) return 0;
  let usable = 0;
  for (const r of rows) {
    const hasNum = r.some((c) => looksNumeric(c));
    const hasName = r.some((c) => String(c).replace(/[^\p{L}]/gu, '').length >= 3);
    if (hasNum && hasName) usable += 1;
  }
  return usable / rows.length;
}

let ocrProvider = null;
/** Registre um provedor de OCR (fn(file|blob) -> Promise<string|rows>) p/ pdf/imagem. */
export function setOcrProvider(fn) { ocrProvider = fn; }
export function hasOcr() { return typeof ocrProvider === 'function'; }

const EXT = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [, ''])[1];

/** Parser CSV/TSV tolerante (aspas, ; , ou tab). Retorna array de arrays. */
export function parseDelimited(text) {
  const nl = text.indexOf('\n');
  const first = nl >= 0 ? text.slice(0, nl) : text;
  const delim = first.includes('\t') ? '\t'
    : ((first.split(';').length > first.split(',').length) ? ';' : ',');
  const rows = [];
  let field = ''; let row = []; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

/**
 * Lê um File/Blob e retorna { kind, sheets? , rows? }:
 *  kind='sheets' -> [{name, rows}]   (xlsx/xlsm)
 *  kind='table'  -> rows (array de arrays)  (csv/paste/ocr)
 */
export async function readFile(file) {
  const ext = EXT(file.name);
  if (ext === 'xlsx' || ext === 'xlsm') {
    const buf = await file.arrayBuffer();
    const { sheets } = await readXlsx(buf);
    return { kind: 'sheets', sheets };
  }
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    return { kind: 'table', rows: parseDelimited(await file.text()) };
  }
  if (ext === 'xls') {
    throw new Error('Formato .xls (binário antigo) não é suportado offline. Abra no Excel e salve como .xlsx.');
  }
  if (ext === 'pdf') {
    // 1) tenta extrair TEXTO (PDF editável) — sem OCR
    const { rows, hadStreams } = await extractPdfText(await file.arrayBuffer());
    const q = pdfQuality(rows);
    if (rows && rows.length && q >= 0.3) return { kind: 'table', rows, source: 'pdf' };
    // 2) tem texto mas veio ruim (fonte CID/layout complexo — ex.: PDF assinado)
    if (hadStreams && rows.length) {
      throw new Error('Não consegui ler este PDF de forma confiável — ele usa fontes incorporadas/layout complexo (comum em documentos assinados/escaneados por software). '
        + 'Caminho que FUNCIONA offline: abra o PDF, selecione a tabela, copie (Ctrl+C) e COLE no campo "Colar tabela" aqui — o leitor de PDF do seu sistema extrai o texto certo. '
        + 'Alternativas: exporte para .xlsx/.csv. (Na migração com internet, dá para plugar o pdf.js e ler PDFs assim automaticamente — hook setOcrProvider.)');
    }
    // 3) sem texto: provavelmente escaneado -> precisa de OCR
    if (ocrProvider) {
      const res = await ocrProvider(file);
      return { kind: 'table', rows: typeof res === 'string' ? parseDelimited(res) : res };
    }
    throw new Error('Este PDF parece escaneado (sem texto embutido). OCR não está disponível offline — '
      + 'copie/cole a tabela, exporte para .xlsx/.csv, ou habilite OCR (setOcrProvider) após migrar para uma rede com internet.');
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp'].includes(ext)) {
    if (!ocrProvider) {
      throw new Error('Imagem requer OCR, indisponível offline nesta máquina. '
        + 'Exporte a fonte para .xlsx/.csv, cole a tabela, ou habilite um provedor de OCR (setOcrProvider) após migrar.');
    }
    const res = await ocrProvider(file);
    return { kind: 'table', rows: typeof res === 'string' ? parseDelimited(res) : res };
  }
  throw new Error(`Formato .${ext || '?'} não reconhecido. Use .xlsx, .xlsm, .csv ou cole do Excel.`);
}

// Leitor de .xlsx/.xlsm SEM dependencias. Descompacta (unzip.js) e extrai as
// celulas do OOXML por scanning tolerante (OOXML e' gerado por maquina e
// regular). Funciona em navegador e Node (nao usa DOMParser).
import { unzip, textOf } from './unzip.js';

function decodeEntities(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function colRowFromRef(ref) {
  const m = String(ref || '').match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}

function parseSharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    let text = '';
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(inner))) text += decodeEntities(t[1]);
    out.push(text);
  }
  return out;
}

function parseSheet(xml, shared) {
  const rows = [];
  if (!xml) return rows;
  const dataM = xml.match(/<sheetData>([\s\S]*?)<\/sheetData>/);
  const data = dataM ? dataM[1] : xml;
  const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = cRe.exec(data))) {
    const attrs = m[1] || '';
    const inner = m[2];
    const ref = attr(attrs, 'r');
    const pos = ref ? colRowFromRef(ref) : null;
    if (!pos) continue;
    const t = attr(attrs, 't');
    let value = null;
    if (inner != null) {
      if (t === 'inlineStr') {
        let text = '';
        const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let tm;
        while ((tm = tRe.exec(inner))) text += decodeEntities(tm[1]);
        value = text;
      } else {
        const vM = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        const raw = vM ? vM[1] : '';
        if (t === 's') value = shared[parseInt(raw, 10)] ?? '';
        else if (t === 'str') value = decodeEntities(raw);
        else if (t === 'b') value = raw === '1';
        else { const n = Number(raw); value = Number.isNaN(n) ? decodeEntities(raw) : n; }
      }
    }
    if (!rows[pos.row]) rows[pos.row] = [];
    rows[pos.row][pos.col] = value;
  }
  // normaliza linhas ausentes
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

function parseWorkbook(wbXml, relsXml) {
  const sheets = [];
  if (!wbXml) return sheets;
  const relMap = {};
  if (relsXml) {
    const rRe = /<Relationship\b([^>]*)\/>/g;
    let r;
    while ((r = rRe.exec(relsXml))) {
      const id = attr(r[1], 'Id');
      let target = attr(r[1], 'Target');
      if (id && target) { target = target.replace(/^\//, '').replace(/^xl\//, ''); relMap[id] = target; }
    }
  }
  const sRe = /<sheet\b([^>]*)\/>/g;
  let s;
  while ((s = sRe.exec(wbXml))) {
    const name = decodeEntities(attr(s[1], 'name') || `Sheet${sheets.length + 1}`);
    const rid = attr(s[1], 'r:id') || attr(s[1], 'id');
    const target = (rid && relMap[rid]) ? relMap[rid] : `worksheets/sheet${sheets.length + 1}.xml`;
    sheets.push({ name, path: `xl/${target.replace(/^xl\//, '')}` });
  }
  return sheets;
}

/**
 * Lê um .xlsx/.xlsm. Retorna { sheets: [{ name, rows }] } onde rows e' um
 * array de arrays (valores string|number|boolean|null).
 * @param {ArrayBuffer|Uint8Array} input
 */
export async function readXlsx(input) {
  const files = await unzip(input);
  const shared = parseSharedStrings(textOf(files, 'xl/sharedStrings.xml'));
  const wb = parseWorkbook(textOf(files, 'xl/workbook.xml'), textOf(files, 'xl/_rels/workbook.xml.rels'));
  const sheets = [];
  for (const s of wb) {
    const xml = textOf(files, s.path);
    sheets.push({ name: s.name, rows: parseSheet(xml, shared) });
  }
  if (!sheets.length) {
    // fallback: primeira worksheet encontrada
    for (const [name] of files) {
      if (/xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
        sheets.push({ name: 'Sheet1', rows: parseSheet(textOf(files, name), shared) });
        break;
      }
    }
  }
  return { sheets };
}

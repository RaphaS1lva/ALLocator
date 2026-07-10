// Extrator de texto de PDF EDITÁVEL (texto embutido), sem dependências.
// Inflaciona os content streams (FlateDecode via zlib) e lê os operadores de
// texto (Tj/TJ/'/") reconstruindo linhas por Y e colunas por X.
// Para decodificar os códigos de caractere corretamente, coleta os mapas
// /ToUnicode das fontes (subconjunto) — sem isso o texto sai embaralhado.
// NÃO faz OCR: PDFs escaneados (sem texto) resultam em vazio.
// Limite: fontes sem /ToUnicode nem Encoding padrão podem sair imperfeitas.
import { inflateZlib } from './unzip.js';

function toU8(input) { return input instanceof Uint8Array ? input : new Uint8Array(input); }

function bytesToLatin1(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return s;
}

// WinAnsi para 0x80-0x9F (o resto coincide com Latin-1). Fallback quando não há ToUnicode.
const WINANSI = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021',
  0x88: '\u02C6', 0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152', 0x8E: '\u017D',
  0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u0153', 0x9E: '\u017E', 0x9F: '\u0178',
};
function winansiChar(code) {
  if (code >= 0x80 && code <= 0x9F) return WINANSI[code] || '';
  if (code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0xFF)) return String.fromCharCode(code);
  if (code > 0xFF) return String.fromCharCode(code);
  return '';
}

// ---- strings do content stream: retornam BYTES crus (decodificados depois) ----
function parseLiteral(str, i) {
  const bytes = [];
  let depth = 1;
  while (i < str.length && depth > 0) {
    const ch = str[i];
    if (ch === '\\') {
      const nx = str[i + 1];
      const map = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      if (nx in map) { bytes.push(map[nx]); i += 2; }
      else if (nx >= '0' && nx <= '7') { let oct = ''; i += 1; let k = 0; while (k < 3 && str[i] >= '0' && str[i] <= '7') { oct += str[i]; i++; k++; } bytes.push(parseInt(oct, 8) & 0xff); }
      else if (nx === '\n') i += 2;
      else if (nx === '\r') i += (str[i + 2] === '\n' ? 3 : 2);
      else { bytes.push(nx.charCodeAt(0) & 0xff); i += 2; }
    } else if (ch === '(') { depth++; bytes.push(40); i++; }
    else if (ch === ')') { depth--; if (depth > 0) bytes.push(41); i++; }
    else { bytes.push(ch.charCodeAt(0) & 0xff); i++; }
  }
  return { bytes, next: i };
}
function parseHex(str, i) {
  let hex = '';
  while (i < str.length && str[i] !== '>') { if (!/\s/.test(str[i])) hex += str[i]; i++; }
  i++;
  if (hex.length % 2) hex += '0';
  const bytes = [];
  for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.substr(k, 2), 16));
  return { bytes, next: i };
}

// ---- /ToUnicode: parse de beginbfchar / beginbfrange ----
function hexToStr(hex) {
  let out = '';
  for (let k = 0; k + 3 < hex.length + 1; k += 4) {
    const part = hex.substr(k, 4);
    if (part.length < 4) break;
    const code = parseInt(part, 16);
    if (code !== 0) out += String.fromCharCode(code); // ignora U+0000 (ruído de dst 8-hex)
  }
  return out || (hex.length >= 2 ? String.fromCharCode(parseInt(hex.substr(0, 2), 16)) : '');
}
function parseToUnicode(content, map, sizes) {
  const charBlk = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = charBlk.exec(content))) {
    const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let p;
    while ((p = pairRe.exec(m[1]))) {
      const code = parseInt(p[1], 16);
      sizes[p[1].length / 2] = (sizes[p[1].length / 2] || 0) + 1;
      map.set(code, hexToStr(p[2]));
    }
  }
  const rangeBlk = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = rangeBlk.exec(content))) {
    const body = m[1];
    // forma: <lo> <hi> <dst>  |  <lo> <hi> [ <d1> <d2> ... ]
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
    let r;
    while ((r = re.exec(body))) {
      const lo = parseInt(r[1], 16); const hi = parseInt(r[2], 16);
      sizes[r[1].length / 2] = (sizes[r[1].length / 2] || 0) + 1;
      if (r[3] != null) {
        const base = parseInt(r[3], 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, String.fromCharCode(base + (c - lo)));
      } else if (r[4] != null) {
        const items = r[4].match(/<([0-9A-Fa-f]+)>/g) || [];
        for (let c = lo; c <= hi && (c - lo) < items.length; c++) map.set(c, hexToStr(items[c - lo].replace(/[<>]/g, '')));
      }
    }
  }
}
function makeDecoder(map, codeSize) {
  return (bytes) => {
    if (map.size && codeSize >= 1) {
      let out = '';
      for (let i = 0; i < bytes.length; i += codeSize) {
        let code = 0;
        for (let k = 0; k < codeSize; k++) code = (code << 8) | (bytes[i + k] || 0);
        const mapped = map.get(code);
        out += (mapped != null) ? mapped : winansiChar(codeSize === 1 ? code : (code & 0xff));
      }
      return out;
    }
    let out = '';
    for (const b of bytes) out += winansiChar(b);
    return out;
  };
}

/** Extrai itens {x,y,text} de um content stream (string), decodificando por `decode`. */
function extractItems(content, decode) {
  const items = [];
  const stack = [];
  let x = 0; let y = 0; let lineX = 0; let lineY = 0; let leading = 0;
  let i = 0; const n = content.length;
  const nums = () => stack.filter((s) => s.type === 'num').map((s) => s.v);
  const lastStr = () => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].type === 'str') return decode(stack[k].bytes); return ''; };
  const lastArr = () => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].type === 'arr') return stack[k].v; return null; };
  const show = (t) => { if (t && t.length) items.push({ x, y, text: t }); };

  while (i < n) {
    const c = content[i];
    if (c === '%') { while (i < n && content[i] !== '\n' && content[i] !== '\r') i++; continue; }
    if (c === '(') { const r = parseLiteral(content, i + 1); stack.push({ type: 'str', bytes: r.bytes }); i = r.next; continue; }
    if (c === '<') {
      if (content[i + 1] === '<') { i += 2; let d = 1; while (i < n && d > 0) { if (content[i] === '<' && content[i + 1] === '<') { d++; i += 2; } else if (content[i] === '>' && content[i + 1] === '>') { d--; i += 2; } else i++; } continue; }
      const r = parseHex(content, i + 1); stack.push({ type: 'str', bytes: r.bytes }); i = r.next; continue;
    }
    if (c === '[') {
      i++; const arr = [];
      while (i < n && content[i] !== ']') {
        const ch = content[i];
        if (ch === '(') { const r = parseLiteral(content, i + 1); arr.push({ type: 'str', bytes: r.bytes }); i = r.next; }
        else if (ch === '<') { const r = parseHex(content, i + 1); arr.push({ type: 'str', bytes: r.bytes }); i = r.next; }
        else if (/\s/.test(ch)) i++;
        else if (/[0-9+\-.]/.test(ch)) { let num = ''; while (i < n && /[0-9+\-.eE]/.test(content[i])) { num += content[i]; i++; } arr.push({ type: 'num', v: parseFloat(num) }); }
        else i++;
      }
      i++; stack.push({ type: 'arr', v: arr }); continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9+\-.]/.test(c)) { let num = ''; while (i < n && /[0-9+\-.eE]/.test(content[i])) { num += content[i]; i++; } stack.push({ type: 'num', v: parseFloat(num) }); continue; }
    if (c === '/') { i++; while (i < n && !/[\s/[\]<>()]/.test(content[i])) i++; stack.push({ type: 'name' }); continue; }
    let op = ''; while (i < n && /[A-Za-z*'"]/.test(content[i])) { op += content[i]; i++; }
    if (!op) { i++; continue; }
    switch (op) {
      case 'Tm': { const v = nums(); if (v.length >= 6) { x = v[4]; y = v[5]; lineX = x; lineY = y; } break; }
      case 'Td': { const v = nums(); if (v.length >= 2) { lineX += v[0]; lineY += v[1]; x = lineX; y = lineY; } break; }
      case 'TD': { const v = nums(); if (v.length >= 2) { leading = -v[1]; lineX += v[0]; lineY += v[1]; x = lineX; y = lineY; } break; }
      case 'TL': { const v = nums(); if (v.length) leading = v[0]; break; }
      case 'T*': { lineY -= leading; x = lineX; y = lineY; break; }
      case 'BT': { x = 0; y = 0; lineX = 0; lineY = 0; break; }
      case 'Tj': show(lastStr()); break;
      case "'": { lineY -= leading; x = lineX; y = lineY; show(lastStr()); break; }
      case '"': { lineY -= leading; x = lineX; y = lineY; show(lastStr()); break; }
      case 'TJ': { const a = lastArr(); if (a) { let s = ''; for (const el of a) { if (el.type === 'str') s += decode(el.bytes); else if (el.type === 'num' && el.v < -120) s += ' '; } show(s); } break; }
      default: break;
    }
    stack.length = 0;
  }
  return items;
}

/** Agrupa itens por Y (linha) e ordena por X (coluna) -> linhas de texto. */
function itemsToRows(items) {
  const buckets = new Map();
  for (const it of items) {
    const key = Math.round(it.y);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const ys = [...buckets.keys()].sort((a, b) => b - a);
  const rows = [];
  for (const yk of ys) {
    const cells = buckets.get(yk).sort((a, b) => a.x - b.x);
    const parts = []; let prev = null;
    for (const cell of cells) {
      if (prev && (cell.x - prev.x) < 3) parts[parts.length - 1] += cell.text;
      else parts.push(cell.text);
      prev = cell;
    }
    const line = parts.map((p) => p.trim()).filter((p) => p !== '');
    if (line.length) rows.push(line);
  }
  return rows;
}

function dictHasImage(dict) { return /\/Subtype\s*\/Image/.test(dict) || /\/Image\b/.test(dict); }
function dictIsFlate(dict) { return /\/FlateDecode/.test(dict); }

/**
 * Extrai texto de um PDF editável. Retorna { text, rows, pages, hadStreams, usedToUnicode }.
 */
export async function extractPdfText(input) {
  const u8 = toU8(input);
  const s = bytesToLatin1(u8);

  // 1) inflaciona todos os streams (exceto imagens) uma vez
  const streams = [];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const dict = m[1];
    const dataStart = m.index + m[0].length;
    const endIdx = s.indexOf('endstream', dataStart);
    if (endIdx < 0) continue;
    let end = endIdx;
    if (s[end - 1] === '\n') end--;
    if (s[end - 1] === '\r') end--;
    if (dictHasImage(dict)) continue;
    let content = null;
    if (dictIsFlate(dict)) { try { content = bytesToLatin1(await inflateZlib(u8.subarray(dataStart, end))); } catch { content = null; } }
    else if (!/\/Filter/.test(dict)) content = s.slice(dataStart, end);
    if (content) streams.push(content);
  }

  // 2) coleta ToUnicode (mapa global) — corrige o "texto embaralhado"
  const uni = new Map();
  const sizes = {};
  for (const c of streams) if (/beginbf(char|range)/.test(c)) parseToUnicode(c, uni, sizes);
  const codeSize = (sizes[2] || 0) > (sizes[1] || 0) ? 2 : 1;
  const decode = makeDecoder(uni, codeSize);

  // 3) extrai conteúdo (BT/Tj) e reconstrói linhas
  let allRows = []; const texts = []; let contentCount = 0;
  for (const c of streams) {
    if (!/BT/.test(c) || !/(Tj|TJ)/.test(c)) continue;
    contentCount++;
    const rows = itemsToRows(extractItems(c, decode));
    if (rows.length) { allRows = allRows.concat(rows); texts.push(rows.map((r) => r.join('\t')).join('\n')); }
  }
  return {
    text: texts.join('\n'), rows: allRows, pages: contentCount, hadStreams: streams.length > 0, usedToUnicode: uni.size > 0,
  };
}

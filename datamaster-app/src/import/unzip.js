// Leitor de ZIP minimo (sem dependencias). Le o Central Directory e infla os
// membros. Usa DecompressionStream('deflate-raw') (disponivel no navegador
// moderno e no Node >=18). Suficiente para abrir .xlsx/.xlsm (que sao zips).

/** Infla bytes deflate-raw (metodo 8 do ZIP) via DecompressionStream. */
export async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Seu ambiente não suporta DecompressionStream (necessário para ler .xlsx).');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); total += value.length;
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/** Infla bytes no formato zlib (deflate com cabeçalho) — usado pelos streams
 * FlateDecode de PDF. Cai para deflate-raw se o zlib falhar. */
export async function inflateZlib(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Seu ambiente não suporta DecompressionStream (necessário para PDF/xlsx).');
  }
  const run = async (fmt, data) => {
    const ds = new DecompressionStream(fmt);
    const writer = ds.writable.getWriter();
    writer.write(data); writer.close();
    const reader = ds.readable.getReader();
    const chunks = []; let total = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); total += value.length;
    }
    const out = new Uint8Array(total); let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
  };
  try { return await run('deflate', bytes); }
  catch { return await run('deflate-raw', bytes); }
}

function findEOCD(dv, u8) {
  // procura a assinatura do End Of Central Directory de tras p/ frente
  for (let i = u8.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new Error('ZIP inválido (EOCD não encontrado).');
}

const decoder = new TextDecoder('utf-8');

/**
 * Descompacta um .zip/.xlsx. Retorna Map<nomeArquivo, Uint8Array>.
 * @param {ArrayBuffer|Uint8Array} input
 */
export async function unzip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const eocd = findEOCD(dv, u8);
  const count = dv.getUint16(eocd + 10, true);
  let cdOffset = dv.getUint32(eocd + 16, true);

  const files = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(u8.subarray(p + 46, p + 46 + nameLen));

    // localiza o inicio dos dados pelo cabecalho local (tamanhos podem diferir)
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(dataStart, dataStart + compSize);

    // eslint-disable-next-line no-await-in-loop
    const data = method === 0 ? raw.slice() : await inflateRaw(raw);
    files.set(name, data);

    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Lê um membro do zip como texto UTF-8. */
export function textOf(files, name) {
  const b = files.get(name);
  return b ? decoder.decode(b) : null;
}

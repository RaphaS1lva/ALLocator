// Testa o extrator de PDF editável com PDFs sintéticos (plano + FlateDecode).
import zlib from 'node:zlib';
import { extractPdfText } from '../src/import/pdf-text.js';
import { autoGuessMapping, buildEntryRows } from '../src/import/mapping.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const content = [
  'BT /F1 10 Tf',
  '1 0 0 1 100 700 Tm (Conta) Tj',
  '1 0 0 1 420 700 Tm (2023) Tj',
  '1 0 0 1 500 700 Tm (2024) Tj',
  '1 0 0 1 100 685 Tm (Caixa e equivalentes) Tj',
  '1 0 0 1 420 685 Tm (800) Tj',
  '1 0 0 1 500 685 Tm (1.000) Tj',
  '1 0 0 1 100 670 Tm (Fornecedores) Tj',
  '1 0 0 1 420 670 Tm (250) Tj',
  '1 0 0 1 500 670 Tm (300) Tj',
  'ET',
].join('\n');

function plainPdf(body) {
  return Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n%%EOF`, 'latin1');
}
function flatePdf(body) {
  const def = zlib.deflateSync(Buffer.from(body, 'latin1')); // formato zlib
  const head = Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length ${def.length} /Filter /FlateDecode >>\nstream\n`, 'latin1');
  const tail = Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1');
  return Buffer.concat([head, def, tail]);
}

async function run(label, buf) {
  console.log(`== ${label} ==`);
  const { rows, pages } = await extractPdfText(buf);
  console.log('  pages/streams:', pages, '| linhas:', rows.length);
  rows.slice(0, 4).forEach((r) => console.log('   ', JSON.stringify(r)));
  ok(pages >= 1, `${label}: achou content stream`);
  ok(rows.length >= 3, `${label}: reconstruiu >=3 linhas`);
  const caixa = rows.find((r) => r[0] && r[0].includes('Caixa'));
  ok(!!caixa, `${label}: linha "Caixa e equivalentes"`);
  ok(caixa && caixa.includes('800') && caixa.includes('1.000'), `${label}: valores na mesma linha`);
  // mapeamento: header "Conta 2023 2024"
  const map = autoGuessMapping(rows[0]);
  ok(map.fields.origem === 0, `${label}: origem=Conta`);
  ok(map.yearCols.length === 2, `${label}: 2 colunas de ano detectadas`);
  const built = buildEntryRows(rows, map, {});
  ok(built.rows.length === 2, `${label}: 2 contas construidas`);
  return built;
}

await run('PDF plano (sem compressao)', plainPdf(content));
await run('PDF FlateDecode (zlib)', flatePdf(content));

// ---- fonte com subconjunto: bytes "errados" corrigidos por /ToUnicode ----
console.log('== PDF com /ToUnicode (corrige texto embaralhado) ==');
const cmap = [
  '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
  '1 begincodespacerange <00> <FF> endcodespacerange',
  '5 beginbfchar',
  '<41> <0043>', '<42> <0041>', '<43> <0049>', '<44> <0058>', '<45> <0041>',
  'endbfchar',
  '1 beginbfrange <30> <39> <0030> endbfrange',
  'endcmap CMapName currentdict /CMap defineresource pop end end',
].join('\n');
const contentB = [
  'BT /F1 10 Tf',
  '1 0 0 1 100 700 Tm (ABCDE) Tj',   // via ToUnicode -> CAIXA
  '1 0 0 1 400 700 Tm (1234) Tj',    // digitos identidade -> 1234
  'ET',
].join('\n');
function twoStreamPdf(a, b) {
  return Buffer.from(
    `%PDF-1.4\n5 0 obj\n<< /Length ${a.length} >>\nstream\n${a}\nendstream\nendobj\n`
    + `4 0 obj\n<< /Length ${b.length} >>\nstream\n${b}\nendstream\nendobj\n%%EOF`, 'latin1');
}
const { rows, usedToUnicode } = await extractPdfText(twoStreamPdf(cmap, contentB));
console.log('  usedToUnicode:', usedToUnicode, '| linhas:', JSON.stringify(rows));
ok(usedToUnicode, 'detectou e usou /ToUnicode');
const cx = rows.find((r) => r.includes('CAIXA'));
ok(!!cx, 'decodificou "ABCDE" -> "CAIXA" via ToUnicode');
ok(cx && cx.includes('1234'), 'dígitos preservados na mesma linha');

console.log(`\n== PDF TEST: ${pass} ok, ${fail} falhas ==`);
process.exit(fail ? 1 : 0);

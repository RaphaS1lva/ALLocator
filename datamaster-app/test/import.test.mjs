// Testa o leitor de xlsx (unzip + OOXML) contra arquivos reais.
import fs from 'node:fs';
import { readXlsx } from '../src/import/xlsx-read.js';
import {
  autoGuessMapping, buildEntryRows, autoDetect, buildRowsPositional,
} from '../src/import/mapping.js';
import { runPipeline } from '../src/core/index.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const DIC = 'C:\\Users\\t825026\\OneDrive - Santander Office 365\\Documentos\\DataMaster\\Dicionário de Contas.xlsx';
const SAIDA = new URL('./saida.xlsx', import.meta.url);

console.log('== xlsx real (Dicionário, deflate + sharedStrings) ==');
const dic = await readXlsx(fs.readFileSync(DIC));
console.log('  sheets:', dic.sheets.map((s) => s.name));
const s0 = dic.sheets[0];
console.log('  linhas:', s0.rows.length, '| header:', s0.rows[0]);
console.log('  1a linha de dados:', s0.rows[1]);
ok(s0.rows.length > 1000, 'leu >1000 linhas do dicionario');
ok(String(s0.rows[0][0]).toUpperCase() === 'ORIGEM', 'header col0 = ORIGEM');
ok(s0.rows[0].includes('Destino no Template'), 'header tem Destino no Template');
ok(!!s0.rows[1][0] && !!s0.rows[1][1], 'primeira linha de dados preenchida');

console.log('== xlsx proprio (saida.xlsx, stored + inlineStr) ==');
try {
  const own = await readXlsx(fs.readFileSync(SAIDA));
  console.log('  sheets:', own.sheets.map((s) => s.name));
  const r = own.sheets.find((s) => s.name === 'Rastreabilidade');
  ok(!!r, 'achou aba Rastreabilidade');
  ok(r && String(r.rows[0][0]) === 'Origem', 'header Rastreabilidade');
  const caixa = r && r.rows.find((row) => row[0] === 'Caixa');
  ok(!!caixa, 'achou linha Caixa');
  console.log('  linha Caixa:', caixa);
} catch (e) { fail++; console.log('  FAIL saida.xlsx:', e.message); }

console.log('== mapeamento de colunas + pipeline (import BP) ==');
const table = [
  ['Conta', 'Grupo', 'Sub Categoria', 'Destino no Template', '2023', '2024', 'Alocação'],
  ['Caixa e bancos', 'Ativo', 'Circulante', 'Caixa', '800', '1.000', 'Sim'],
  ['Clientes a receber', 'Ativo', 'Circulante', '', '400', '500', 'Sim'],
  ['Fornecedores', 'Passivo', 'Circulante', 'Fornecedores', '250', '300', 'Sim'],
  ['Bancos CP', 'Passivo', 'Circulante', 'Bancos', '150', '200', 'Sim'],
  ['Capital', 'Passivo', 'PL', 'Capital Social', '800', '1.000', 'Sim'],
];
const map = autoGuessMapping(table[0]);
ok(map.fields.origem === 0, 'auto-map: origem=Conta(0)');
ok(map.fields.grupo === 1 && map.fields.subCategoria === 2, 'auto-map: grupo/sub');
ok(map.fields.destino === 3, 'auto-map: destino');
ok(map.yearCols.length === 2 && map.yearCols[0].ano === '2023', 'auto-map: 2 colunas de ano');
const built = buildEntryRows(table, map, {});
ok(built.rows.length === 5, `5 linhas construidas (${built.rows.length})`);
ok(JSON.stringify(built.anos) === JSON.stringify(['2023', '2024']), 'anos ["2023","2024"]');
ok(built.rows[0].valores['2024'] === '1.000', 'valor cru preservado (coerceNumber depois)');
const resImp = runPipeline(built.rows);
console.log('  balance 2024:', resImp.shadow.balance.ano3.ativo, '=', resImp.shadow.balance.ano3.passivoPl);
ok(resImp.shadow.balance.ano3.ok, 'BP importado fecha Ativo=Passivo+PL');

console.log('== codigo contabil -> grupo (§8.7) ==');
const table2 = [['Código', 'Descrição', '2024'], ['1.1.01', 'Caixa geral', '100'], ['2.1.01', 'Fornecedores', '80']];
const map2 = autoGuessMapping(table2[0]);
const built2 = buildEntryRows(table2, map2, {});
ok(built2.rows[0].grupo === 'Ativo', `codigo 1.x -> Ativo (${built2.rows[0].grupo})`);
ok(built2.rows[1].grupo === 'Passivo', `codigo 2.x -> Passivo (${built2.rows[1].grupo})`);

console.log('== auto-detecção posicional (PDF sem cabeçalho) ==');
const pdfLike = [
  ['Balanço Patrimonial em 31/12/2024'],   // título (sem números) -> ignorado
  ['Caixa e equivalentes', '1.000', '800'],
  ['Clientes', '1.500', '1.200'],
  ['Fornecedores', '300', '250'],
];
const det = autoDetect(pdfLike, []);
ok(det.mode === 'positional', `modo posicional detectado (${det.mode})`);
const bp = buildRowsPositional(pdfLike, { headerRow: det.headerRow, anos: det.anos });
console.log('  anos:', bp.anos, '| contas:', bp.rows.length);
ok(bp.rows.length === 3, `3 contas (título ignorado) (${bp.rows.length})`);
const cx = bp.rows.find((r) => r.origem.includes('Caixa'));
ok(!!cx, 'origem "Caixa e equivalentes"');
ok(cx && Object.keys(cx.valores).length === 2, `2 valores por linha (${cx && Object.keys(cx.valores).length})`);
const vv = cx ? Object.values(cx.valores).map(String) : [];
ok(vv.includes('1.000') && vv.includes('800'), 'valores 1.000 e 800 preservados (nada perdido)');
// alocação automática via dicionário: Fornecedores -> destino
const resP = runPipeline(bp.rows);
const forn = resP.rows.find((r) => r.origem === 'Fornecedores');
ok(forn && forn.destino, `Fornecedores alocado automaticamente (${forn && forn.destino})`);

console.log('== colar do PDF (linha única, separada por espaços) ==');
const pasted = [
  ['Ativo Circulante'],                          // título (sem números) -> ignorado
  ['Caixa e equivalentes     1.000    800'],
  ['Clientes a receber       1.500    1.200'],
  ['Fornecedores               300     250'],
];
const detP = autoDetect(pasted, []);
const bpP = buildRowsPositional(pasted, { headerRow: detP.headerRow, anos: detP.anos });
ok(bpP.rows.length === 3, `colar: 3 contas (título ignorado) (${bpP.rows.length})`);
const cxP = bpP.rows.find((r) => r.origem.includes('Caixa'));
ok(cxP && cxP.origem === 'Caixa e equivalentes', `colar: nome preservado (${cxP && cxP.origem})`);
ok(cxP && Object.keys(cxP.valores).length === 2, `colar: 2 valores (${cxP && Object.keys(cxP.valores).length})`);
const vvP = cxP ? Object.values(cxP.valores).map(String) : [];
ok(vvP.includes('1.000') && vvP.includes('800'), 'colar: valores 1.000 e 800 corretos');

console.log(`\n== IMPORT TEST: ${pass} ok, ${fail} falhas ==`);
process.exit(fail ? 1 : 0);

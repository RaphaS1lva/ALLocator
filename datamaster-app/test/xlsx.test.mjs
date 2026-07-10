// Gera um .xlsx com o escritor puro e salva p/ validar com openpyxl.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../src/core/index.js';
import { buildWorkbookBytes, buildOutputFilename } from '../src/excel/exportWorkbook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const entrada = [
  { origem: 'Caixa', grupo: 'Ativo', subCategoria: 'Circulante', destino: 'Caixa', alocacaoHierarquia: 'Sim', valores: { 2023: 800, 2024: 1000 } },
  { origem: 'Duplicatas a receber', grupo: 'Ativo', subCategoria: 'Circulante', alocacaoHierarquia: 'Sim', valores: { 2023: 400, 2024: 500 } },
  { origem: 'Fornecedores', grupo: 'Passivo', subCategoria: 'Circulante', destino: 'Fornecedores', alocacaoHierarquia: 'Sim', valores: { 2023: 250, 2024: 300 } },
  { origem: 'Bancos', grupo: 'Passivo', subCategoria: 'Circulante', destino: 'Bancos', alocacaoHierarquia: 'Sim', valores: { 2023: 150, 2024: 200 } },
  { origem: 'Capital Social', grupo: 'Passivo', subCategoria: 'PL', destino: 'Capital Social', alocacaoHierarquia: 'Sim', valores: { 2023: 800, 2024: 1000 } },
  { origem: 'Receita Bruta', grupo: 'DRE', subCategoria: 'DRE', destino: 'Vendas Totais', alocacaoHierarquia: 'Sim', valores: { 2023: 4000, 2024: 5000 } },
  { origem: 'ICMS s/ vendas', grupo: 'DRE', subCategoria: 'DRE', destino: '-Impostos', alocacaoHierarquia: 'Sim', valores: { 2023: -600, 2024: -800 } },
];

const header = {
  empresa: 'Acme Indústria Ltda', cnpj: '12.345.678/0001-90', grupo: 'Grupo Acme',
  modelo: 'Consolidado', auditado: 'Sim', unidade: 'Mil', moeda: 'BRL',
};

const res = runPipeline(entrada);
const bytes = buildWorkbookBytes(res, header, [
  { origem: 'Duplicatas a receber', destino: 'Clientes', grupo: 'Ativo', subCategoria: 'Circulante', fonte: 'aprendido' },
]);
const out = path.join(__dirname, 'saida.xlsx');
fs.writeFileSync(out, Buffer.from(bytes));
console.log('nome padrao:', buildOutputFilename(header, res.years));
console.log('bytes:', bytes.length, '->', out);
console.log('balance ano3 ok:', res.shadow.balance.ano3.ok, '| dif:', res.shadow.balance.ano3.dif);

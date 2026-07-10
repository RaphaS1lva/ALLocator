// Testes do core (node, sem dependencias). Rode: node test/core.test.mjs
import { runPipeline } from '../src/core/index.js';
import { normalizeText, tokenOverlap, coerceNumber } from '../src/core/normalize.js';
import { computeStoredValue, signKind } from '../src/core/sign.js';

let pass = 0; let fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (esperado ${b}, obteve ${a})`); }
function near(a, b, msg) { ok(Math.abs(a - b) < 0.5, `${msg} (esperado ~${b}, obteve ${a})`); }

console.log('== normalize ==');
eq(normalizeText('Ações  Preferenciais Ç'), 'acoes preferenciais c', 'normalizeText acentos');
ok(tokenOverlap('caixa e equivalentes', 'caixa equivalentes') > 0.5, 'tokenOverlap');
eq(coerceNumber('(1.234,56)'), -1234.56, 'coerceNumber BR parenteses');
eq(coerceNumber('1,234.56'), 1234.56, 'coerceNumber US');
eq(coerceNumber('R$ 1.000'), 1000, 'coerceNumber milhar BR');

console.log('== sinal ==');
eq(signKind('-Impostos'), 'neg', 'signKind neg');
eq(signKind('+ Receitas Financeiras'), 'pos', 'signKind pos');
eq(signKind('+/- Variações Cambiais'), 'pm', 'signKind pm');
eq(signKind('Vendas Totais'), 'none', 'signKind none');
eq(computeStoredValue(-50, '-Impostos', 'DRE'), 50, 'sinal neg -> |OCR|');
eq(computeStoredValue(-30, '+/- Variações Cambiais', 'DRE'), -30, 'sinal pm preserva');
// balancete: passivo saldo +200 -> apresentacao -200 -> destino none preserva -200
eq(computeStoredValue(200, 'Bancos', 'Passivo', { isBalancete: true }), -200, 'balancete passivo');

console.log('== pipeline: BP+DRE balanceado ==');
const entrada = [
  { origem: 'Caixa', grupo: 'Ativo', subCategoria: 'Circulante', destino: 'Caixa', alocacaoHierarquia: 'Sim', valores: { 2024: 1000 } },
  { origem: 'Duplicatas a receber', grupo: 'Ativo', subCategoria: 'Circulante', alocacaoHierarquia: 'Sim', valores: { 2024: 500 } }, // sem destino -> matching
  { origem: 'Fornecedores', grupo: 'Passivo', subCategoria: 'Circulante', destino: 'Fornecedores', alocacaoHierarquia: 'Sim', valores: { 2024: 300 } },
  { origem: 'Bancos', grupo: 'Passivo', subCategoria: 'Circulante', destino: 'Bancos', alocacaoHierarquia: 'Sim', valores: { 2024: 200 } },
  { origem: 'Capital Social', grupo: 'Passivo', subCategoria: 'PL', destino: 'Capital Social', alocacaoHierarquia: 'Sim', valores: { 2024: 1000 } },
  { origem: 'Receita Bruta', grupo: 'DRE', subCategoria: 'DRE', destino: 'Vendas Totais', alocacaoHierarquia: 'Sim', valores: { 2024: 5000 } },
  { origem: 'ICMS sobre vendas', grupo: 'DRE', subCategoria: 'DRE', destino: '-Impostos', alocacaoHierarquia: 'Sim', valores: { 2024: -800 } },
];
const res = runPipeline(entrada);
eq(res.years.length, 1, 'anos detectados');
eq(res.yearHeaders[2].header, '2024', 'ano mais recente em Ano 3');
eq(res.yearHeaders[0].header, 'Ano 1', 'Ano 1 vazio (placeholder)');

// Clientes: "Duplicatas a receber" deve casar via dicionario para "Clientes"
const dup = res.rows.find((r) => r.origem === 'Duplicatas a receber');
ok(dup && dup.destino, `matching preencheu destino de Duplicatas (${dup && dup.destino})`);

// sinal do ICMS (-Impostos) deve ter virado positivo (|OCR|)
const icms = res.rows.find((r) => r.origem === 'ICMS sobre vendas');
eq(icms.ano3, 800, 'ICMS gravado positivo (destino -Impostos)');

// Chave / Chave Destino
eq(res.rows.find((r) => r.origem === 'Caixa').chaveDestino, 'Caixa|Ativo|Circulante', 'chaveDestino Caixa');

// Shadow: balanco fecha
const b = res.shadow.balance.ano3;
console.log('   Ativo=%s  Passivo+PL=%s  dif=%s  ok=%s', b.ativo, b.passivoPl, b.dif, b.ok);
near(b.ativo, 1500, 'TOTAL ATIVO = 1500');
near(b.passivoPl, 1500, 'Passivo + PL = 1500');
ok(b.ok, 'Ativo = Passivo + PL fecha');

// DRE: Vendas Liquidas = 5000 - 800 = 4200
const vl = res.shadow.dre.find((d) => d.destino === 'Vendas Líquidas');
near(vl.ano3, 4200, 'Vendas Líquidas = 4200');

// QA sem erros de balanco
const erros = res.qa.issues.filter((i) => i.level === 'error');
console.log('   QA: %d erros, %d avisos', res.qa.summary.nErros, res.qa.summary.nAvisos);
ok(!erros.some((e) => e.code === 'balance'), 'sem erro de balanco');

console.log('== totalizador / hierarquia ==');
const hier = [
  { origem: 'Caixa e Equivalentes', grupo: 'Ativo', subCategoria: 'Circulante', destino: 'Caixa', alocacaoHierarquia: 'Sim', valores: { 2024: 100 } },
  { origem: 'Banco Itaú', hierarquia: 'Caixa e Equivalentes', grupo: 'Ativo', subCategoria: 'Circulante', alocacaoHierarquia: 'Não', valores: { 2024: 60 } },
  { origem: 'Banco Bradesco', hierarquia: 'Caixa e Equivalentes', grupo: 'Ativo', subCategoria: 'Circulante', alocacaoHierarquia: 'Não', valores: { 2024: 40 } },
];
const rh = runPipeline(hier);
const pai = rh.rows.find((r) => r.origem === 'Caixa e Equivalentes');
eq(pai.totalizador, 'Sim', 'pai detectado como totalizador');
const filho = rh.rows.find((r) => r.origem === 'Banco Itaú');
eq(filho.hierarquiaDisplay, 'Caixa e Equivalentes', 'filho exibe pai na hierarquia');
eq(filho.chave, '', 'filho Não nao gera chave');

console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==`);
process.exit(fail ? 1 : 0);

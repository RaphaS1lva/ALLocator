// Monta o workbook (Rastreabilidade + Shadow + Base de dados + Dicionario)
// a partir do resultado do pipeline e dispara o download (browser).
// Valores "assados" (numeros calculados) no layout do template.
import { buildXlsx } from './xlsx.js';

const HDR = 2;   // estilo header (negrito, fundo Santander)
const NUM = 1;   // estilo numero contabil #,##0;(#,##0)

function h(v) { return { v, t: 's', s: HDR }; }
function n(v) { return (v === null || v === undefined) ? '' : { v, t: 'n', s: NUM }; }

// Colunas da Base de dados (linha 1 do template).
export const BASE_DADOS_HEADERS = [
  'Versão do GPT', 'Matricula do usuario', 'CNPJ', 'Empresa', 'Grupo', 'Segmento ?',
  'Modelo do arquivo', 'Formato Auditado', 'Unidade de medida', 'Moeda',
  'Modificação base de Valores', 'Páginas do input', 'Páginas de referência (BP+DRE)',
  'Nível de complexidade de alocação e planilhamento', 'Tempo de Início (GPT)',
  'Tempo Final (GPT)', 'Anos identificados', 'Data/hora de geração', 'Arquivo gerado',
];

function sanitize(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|\s]/g, '') || 'Empresa';
}
function onlyDigits(s) { return String(s || '').replace(/\D/g, '') || 'SemCNPJ'; }

/** Nome padrao: {empresa}_{cnpj}_Output_{ddMMyyyy}_ALLOCATOR_{ano}.xlsx */
export function buildOutputFilename(header, years) {
  const d = new Date();
  const data = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
  const ano = years && years.length ? years[years.length - 1] : 'SemAno';
  return `${sanitize(header.empresa)}_${onlyDigits(header.cnpj)}_Output_${data}_ALLOCATOR_${ano}.xlsx`;
}

function rastreabilidadeSheet(result) {
  const yh = result.yearHeaders.map((y) => y.header);
  const rows = [[
    h('Origem'), h('Hierarquia'), h('Totalizador'), h('Alocação da Hierarquia'),
    h('Página Referência'), h(yh[0]), h(yh[1]), h(yh[2]), h('Grupo'), h('Sub Categoria'),
    h('Destino no Template'), h('Tipo de Mapeamento'), h('Chave'), h('Chave Destino'),
  ]];
  for (const r of result.rows) {
    rows.push([
      r.origem, r.hierarquiaDisplay || r.hierarquia, r.totalizador, r.alocacaoHierarquia,
      r.paginaReferencia, n(r.ano1), n(r.ano2), n(r.ano3), r.grupo, r.subCategoria,
      r.destino, r.tipoMapeamento, r.chave, r.chaveDestino,
    ]);
  }
  return { name: 'Rastreabilidade', rows };
}

function shadowSheet(result) {
  const yh = result.yearHeaders.map((y) => y.header);
  const rows = [[h('Conta'), h('Grupo'), h('Sub Categoria'), h(yh[0]), h(yh[1]), h(yh[2]), h('Memória Atual')]];
  const line = (item, isSub) => [
    isSub ? { v: item.destino, s: HDR } : item.destino,
    item.grupo, item.subCategoria,
    n(round(item.ano1)), n(round(item.ano2)), n(round(item.ano3)),
    (item.memoriaAtual || []).join('  +  '),
  ];
  rows.push([h('— ATIVO / PASSIVO / PL —')]);
  for (const item of result.shadow.ativoPassivo) rows.push(line(item, item.tipo !== 'conta'));
  rows.push([]);
  rows.push([h('— DRE —')]);
  for (const item of result.shadow.dre) rows.push(line(item, item.tipo !== 'conta'));
  return { name: 'Shadow', rows };
}

function round(v) { return v == null ? null : Math.round(Number(v) * 100) / 100; }

function baseDadosSheet(header, years) {
  const now = new Date();
  const values = {
    'Versão do GPT': 'app-web v1.0',
    'CNPJ': header.cnpj || '',
    'Empresa': header.empresa || '',
    'Grupo': header.grupo || '',
    'Modelo do arquivo': header.modelo || '',
    'Formato Auditado': header.auditado || '',
    'Unidade de medida': header.unidade || '',
    'Moeda': header.moeda || '',
    'Anos identificados': (years || []).join(', '),
    'Data/hora de geração': now.toLocaleString('pt-BR'),
    'Arquivo gerado': buildOutputFilename(header, years),
  };
  const rows = [
    BASE_DADOS_HEADERS.map(h),
    BASE_DADOS_HEADERS.map((k) => values[k] ?? ''),
  ];
  return { name: 'Base de dados', rows };
}

function dicionarioSheet(dicionario) {
  const rows = [[h('Origem'), h('Destino no Template'), h('Grupo'), h('Sub Categoria'), h('Fonte')]];
  for (const e of (dicionario || [])) rows.push([e.origem, e.destino, e.grupo, e.subCategoria, e.fonte || '']);
  return { name: 'Dicionário', rows };
}

/**
 * Gera os bytes do .xlsx.
 * @param {object} result resultado do runPipeline
 * @param {object} header metadados (empresa, cnpj, ...)
 * @param {Array} [dicionario] entradas atuais do dicionario (opcional)
 */
export function buildWorkbookBytes(result, header, dicionario) {
  const sheets = [
    rastreabilidadeSheet(result),
    shadowSheet(result),
    baseDadosSheet(header, result.years),
  ];
  if (dicionario && dicionario.length) sheets.push(dicionarioSheet(dicionario));
  return buildXlsx(sheets);
}

/** Dispara o download no browser. */
export function downloadWorkbook(result, header, dicionario) {
  const bytes = buildWorkbookBytes(result, header, dicionario);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildOutputFilename(header, result.years);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return a.download;
}

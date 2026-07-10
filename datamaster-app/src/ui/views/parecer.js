// Tela 4: Parecer / QA (validacoes + resumo).
import { el, clear } from '../dom.js';

function stat(n, label) {
  return el('div', { class: 'stat' }, [el('div', { class: 'n' }, String(n)), el('div', { class: 'l' }, label)]);
}

export function renderParecer(container, ctx) {
  const { state } = ctx;
  clear(container);
  if (!state.result) { container.appendChild(el('div', { class: 'panel muted' }, 'Sem dados ainda.')); return; }
  const { qa } = state.result;
  const s = qa.summary;

  container.appendChild(el('div', { class: 'panel' }, [
    el('h2', {}, 'Resumo da análise'),
    el('div', { class: 'stats' }, [
      stat(s.quantidadeLinhas, 'Linhas capturadas'),
      stat(s.quantidadeAlocadas, 'Alocadas (Sim)'),
      stat(s.quantidadeContexto, 'Contexto (Não)'),
      stat(s.nErros, 'Erros'),
      stat(s.nAvisos, 'Avisos'),
      stat(s.simAlocadasZeradas, 'Sim zeradas'),
    ]),
    el('h3', {}, 'Tipos de mapeamento (alocadas)'),
    el('div', { class: 'stats' }, Object.entries(s.tiposMapeamento).length
      ? Object.entries(s.tiposMapeamento).map(([k, v]) => stat(v, k))
      : [el('span', { class: 'muted' }, 'nenhuma')]),
    el('h3', {}, 'Cobertura de valores'),
    el('div', { class: 'stats' }, [
      stat(s.cobertura.simComValor, 'Sim c/ valor'),
      stat(s.cobertura.simSemValor, 'Sim s/ valor'),
      stat(s.cobertura.naoComValor, 'Não c/ valor'),
      stat(s.cobertura.naoSemValor, 'Não s/ valor'),
      stat(`${s.totalizadores.alocadosSim}/${s.totalizadores.total}`, 'Totalizadores Sim'),
    ]),
  ]));

  const groups = [
    ['error', 'Erros (bloqueiam a entrega)'],
    ['warn', 'Avisos (revisar)'],
    ['info', 'Sugestões'],
  ];
  for (const [level, title] of groups) {
    const items = qa.issues.filter((i) => i.level === level);
    if (!items.length) continue;
    container.appendChild(el('div', { class: 'panel' }, [
      el('h2', {}, `${title} — ${items.length}`),
      ...items.map((i) => el('div', { class: `issue ${level}` }, [
        el('span', { class: 'code' }, i.code), i.msg,
      ])),
    ]));
  }

  if (!qa.issues.length) {
    container.appendChild(el('div', { class: 'panel' }, el('div', { class: 'issue info' }, 'Nenhum problema detectado pelas validações.')));
  }
}

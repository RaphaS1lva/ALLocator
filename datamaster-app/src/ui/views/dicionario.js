// Tela 5: Dicionario dinamico (busca, entradas aprendidas/manuais, log).
import { el, clear } from '../dom.js';
import { normalizeText } from '../../core/normalize.js';

const LIMIT = 300;

function fonteBadge(f) {
  const cls = f === 'aprendido' ? 'aprendido' : f === 'manual' ? 'manual' : 'seed';
  return el('span', { class: `badge ${cls}` }, f || 'seed');
}

export function renderDicionario(container, ctx) {
  const { state, actions } = ctx;
  clear(container);
  const dic = state.dicionario || [];
  const learned = dic.filter((d) => d.fonte && d.fonte !== 'seed');

  // stats
  const stats = el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [el('div', { class: 'n' }, String(dic.length)), el('div', { class: 'l' }, 'Regras totais')]),
    el('div', { class: 'stat' }, [el('div', { class: 'n' }, String(dic.length - learned.length)), el('div', { class: 'l' }, 'Seed (base)')]),
    el('div', { class: 'stat' }, [el('div', { class: 'n' }, String(learned.length)), el('div', { class: 'l' }, 'Aprendidas/manuais')]),
  ]);

  // busca
  const q = state._dicQuery || '';
  const search = el('input', {
    class: 'search', placeholder: 'Buscar origem ou destino…', value: q,
    oninput: (e) => { state._dicQuery = e.target.value; renderTable(); },
  });

  // form de nova regra manual
  const nf = { origem: '', destino: '', grupo: 'Ativo', subCategoria: 'Circulante' };
  const mk = (k, ph) => el('input', { placeholder: ph, oninput: (e) => { nf[k] = e.target.value; } });
  const oIn = mk('origem', 'Origem'); const dIn = mk('destino', 'Destino');
  const gIn = el('select', { onchange: (e) => { nf.grupo = e.target.value; } }, ['Ativo', 'Passivo', 'DRE'].map((v) => el('option', {}, v)));
  const sIn = el('select', { onchange: (e) => { nf.subCategoria = e.target.value; } }, ['Circulante', 'Não Circulante', 'PL', 'DRE'].map((v) => el('option', {}, v)));
  const addForm = el('div', { class: 'toolbar' }, [
    oIn, dIn, gIn, sIn,
    el('button', {
      class: 'btn primary',
      onclick: async () => {
        if (!nf.origem || !nf.destino) return;
        await actions.addDicEntry({ ...nf, fonte: 'manual' });
        oIn.value = ''; dIn.value = '';
      },
    }, '+ Adicionar regra'),
  ]);

  const tableWrap = el('div', { class: 'table-wrap' });
  const container2 = container;

  function renderTable() {
    const term = normalizeText(state._dicQuery || '');
    let rows = dic;
    if (term) rows = dic.filter((d) => normalizeText(d.origem).includes(term) || normalizeText(d.destino).includes(term));
    const total = rows.length;
    rows = rows.slice(0, LIMIT);
    const head = el('tr', {}, [el('th', {}, 'Origem'), el('th', {}, 'Destino'), el('th', {}, 'Grupo'), el('th', {}, 'Sub'), el('th', {}, 'Fonte'), el('th', {}, '')]);
    const body = el('tbody', {}, rows.map((d) => el('tr', {}, [
      el('td', {}, d.origem), el('td', {}, d.destino), el('td', {}, d.grupo), el('td', {}, d.subCategoria),
      el('td', {}, fonteBadge(d.fonte)),
      el('td', {}, (d.fonte && d.fonte !== 'seed' && d.id)
        ? el('button', { class: 'btn ghost', onclick: () => actions.deleteDicEntry(d.id) }, '✕') : ''),
    ])));
    clear(tableWrap).appendChild(el('table', {}, [el('thead', {}, head), body]));
    if (total > LIMIT) tableWrap.appendChild(el('p', { class: 'hint' }, `Mostrando ${LIMIT} de ${total} — refine a busca.`));
  }
  renderTable();

  container2.appendChild(el('div', { class: 'panel' }, [
    el('h2', {}, 'Dicionário de Contas dinâmico'),
    el('p', { class: 'hint' }, 'O dicionário aprende automaticamente: cada linha alocada (Sim) ao salvar uma análise cria/atualiza a regra Origem→Destino. Você também pode adicionar regras manuais.'),
    stats,
    el('div', { class: 'toolbar', style: 'margin-top:12px' }, [search]),
    addForm,
    tableWrap,
  ]));

  // log
  const log = state._dicLog || [];
  if (log.length) {
    container2.appendChild(el('div', { class: 'panel' }, [
      el('h2', {}, 'Aprendizado recente'),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Quando'), el('th', {}, 'Ação'), el('th', {}, 'Origem'), el('th', {}, 'Destino')])),
        el('tbody', {}, log.slice(0, 50).map((l) => el('tr', {}, [
          el('td', {}, new Date(l.ts).toLocaleString('pt-BR')),
          el('td', {}, el('span', { class: `badge ${l.acao === 'novo' ? 'aprendido' : 'manual'}` }, l.acao)),
          el('td', {}, l.origem), el('td', {}, l.destino),
        ]))),
      ])),
    ]));
  }
}

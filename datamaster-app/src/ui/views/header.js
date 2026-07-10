// Tela 1: Cabecalho da analise (empresa, periodo, unidade/moeda, anos).
import { el, clear } from '../dom.js';

const opt = (v, sel) => el('option', { value: v, selected: v === sel ? true : null }, v);

export function renderHeader(container, ctx) {
  const { state, actions } = ctx;
  const h = state.header;
  clear(container);

  const field = (label, input) => el('label', { class: 'field' }, [label, input]);
  const text = (key, ph = '') => el('input', {
    value: h[key] ?? '', placeholder: ph,
    oninput: (e) => actions.setHeader({ [key]: e.target.value }),
  });
  const select = (key, opts) => el('select', {
    onchange: (e) => actions.setHeader({ [key]: e.target.value }),
  }, opts.map((o) => opt(o, h[key])));

  const panel = el('div', { class: 'panel' }, [
    el('h2', {}, 'Identificação da empresa e do documento'),
    el('div', { class: 'grid-form' }, [
      field('Empresa', text('empresa', 'Razão social')),
      field('CNPJ', text('cnpj', '00.000.000/0000-00')),
      field('Grupo econômico', text('grupo')),
      field('Modelo / Visão', select('modelo', ['', 'Individual', 'Controladora', 'Consolidado', 'Combinado', 'Balancete', 'Outro'])),
      field('Formato auditado', select('auditado', ['', 'Sim', 'Não'])),
      field('Consolidado', select('consolidado', ['', 'Sim', 'Não'])),
      field('Unidade de medida', select('unidade', ['', 'Mil', 'MM', 'Bi'])),
      field('Moeda', select('moeda', ['', 'BRL', 'USD', 'EUR'])),
    ]),
  ]);

  // Anos (ate 3) + flag balancete
  const anos = (h.anos && h.anos.length ? h.anos : ['', '', '']).slice(0, 3);
  while (anos.length < 3) anos.push('');
  const anoInputs = anos.map((a, i) => el('input', {
    value: a, placeholder: `Ano ${i + 1}`, style: 'width:110px',
    oninput: (e) => {
      const next = [...anos];
      next[i] = e.target.value.trim();
      actions.setHeader({ anos: next.filter((x) => x !== '') }, { anosChanged: true });
    },
  }));

  const periodo = el('div', { class: 'panel' }, [
    el('h2', {}, 'Períodos e natureza da fonte'),
    el('p', { class: 'hint' }, 'Informe até 3 anos (o mais recente vai para "Ano 3", alinhado à direita — igual ao template).'),
    el('div', { class: 'toolbar' }, [
      el('span', { class: 'muted' }, 'Anos: '), ...anoInputs,
    ]),
    el('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:8px;margin-top:10px' }, [
      el('input', {
        type: 'checkbox', checked: h.isBalancete ? true : null,
        onchange: (e) => actions.setHeader({ isBalancete: e.target.checked }),
      }),
      el('span', {}, 'A fonte é um BALANCETE bruto (aplica conversão de sinal por grupo, §14.2)'),
    ]),
  ]);

  container.appendChild(panel);
  container.appendChild(periodo);
}

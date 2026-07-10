// Modal de importacao: arquivo/colar -> (aba) -> mapeamento -> preview -> importar.
import { el, clear, toast, money } from '../dom.js';
import { readFile, parseDelimited } from '../../import/readers.js';
import { coerceNumber } from '../../core/normalize.js';
import {
  autoGuessMapping, buildEntryRows, effectiveYears, IMPORT_FIELDS,
  autoDetect, buildRowsPositional,
} from '../../import/mapping.js';
import { colLetter } from '../../excel/xlsx.js';

export function openImportModal(ctx) {
  const { actions, state } = ctx;
  let table = null;

  const body = el('div', { class: 'modal-body' });
  const foot = el('div', { class: 'modal-foot' });
  const overlay = el('div', { class: 'overlay' }, el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('strong', {}, 'Importar contas'), el('button', { class: 'btn ghost', onclick: close }, '✕')]),
    body, foot,
  ]));
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  function close() { overlay.remove(); }

  step1();

  function step1() {
    clear(body); clear(foot);
    const fileInput = el('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv,.txt,.tsv,.pdf,.png,.jpg,.jpeg', onchange: onFile });
    const pasteArea = el('textarea', { class: 'paste', rows: 6, placeholder: 'Cole aqui (Ctrl+V) uma tabela copiada do Excel — a 1ª linha deve ser o cabeçalho…' });
    body.appendChild(el('div', {}, [
      el('p', { class: 'hint' }, 'Offline: .xlsx, .xlsm, .csv, colar (Ctrl+V) do Excel, ou PDF editável simples. Dica: PDF assinado/escaneado costuma vir ruim — abra o PDF, selecione a tabela, copie (Ctrl+C) e COLE abaixo (o leitor do sistema extrai certo). (.xls → salve como .xlsx.)'),
      el('label', { class: 'field' }, ['Arquivo', fileInput]),
      el('div', { class: 'hint', style: 'text-align:center;margin:8px' }, '— ou —'),
      el('label', { class: 'field' }, ['Colar tabela', pasteArea]),
    ]));
    foot.appendChild(el('button', { class: 'btn', onclick: close }, 'Cancelar'));
    foot.appendChild(el('button', {
      class: 'btn primary',
      onclick: () => { const t = pasteArea.value.trim(); if (!t) { toast('Selecione um arquivo ou cole uma tabela.', 'error'); return; } table = parseDelimited(t); autoStep(); },
    }, 'Usar texto colado'));
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const res = await readFile(f);
      if (res.kind === 'sheets') {
        if (res.sheets.length > 1) { pickSheet(res.sheets); return; }
        table = res.sheets[0] ? res.sheets[0].rows : [];
      } else table = res.rows;
      autoStep();
    } catch (err) { showError(err.message); }
  }

  function pickSheet(sheets) {
    clear(body); clear(foot);
    body.appendChild(el('p', {}, 'Escolha a planilha:'));
    for (const s of sheets) {
      body.appendChild(el('button', { class: 'btn', style: 'margin:4px', onclick: () => { table = s.rows; autoStep(); } }, `${s.name} — ${s.rows.length} linhas`));
    }
    foot.appendChild(el('button', { class: 'btn', onclick: step1 }, 'Voltar'));
  }

  function showError(msg) {
    clear(body); clear(foot);
    body.appendChild(el('div', { class: 'issue error' }, msg));
    foot.appendChild(el('button', { class: 'btn', onclick: step1 }, 'Voltar'));
  }

  // Tela AUTOMÁTICA: detecta tudo, mostra prévia e importa (sem mapeamento manual).
  function autoStep() {
    if (!table || !table.length) { showError('Tabela vazia.'); return; }
    clear(body); clear(foot);
    let alocPad = 'Sim';
    const det = autoDetect(table, state.header.anos);
    const build = () => (det.mode === 'positional'
      ? buildRowsPositional(table, { headerRow: det.headerRow, anos: det.anos, alocacaoPadrao: alocPad })
      : buildEntryRows(table, det.mapping, { headerRow: det.headerRow, alocacaoPadrao: alocPad }));

    const info = el('div', { class: 'hint' });
    const preview = el('div', { class: 'table-wrap', style: 'max-height:280px' });
    const importBtn = el('button', { class: 'btn primary' }, 'Importar');
    const alocChk = el('input', { type: 'checkbox', checked: true, onchange: (e) => { alocPad = e.target.checked ? 'Sim' : 'Não'; render(); } });

    function render() {
      const { rows, anos } = build();
      info.textContent = `Detecção automática: ${rows.length} conta(s)`
        + (anos.length ? ` · anos: ${anos.join(', ')}` : ' · sem anos (defina no Cabeçalho)')
        + (det.mode === 'positional' ? ' · modo posicional (nome + números)' : ' · por cabeçalho');
      const cols = anos;
      const head = el('tr', {}, [el('th', {}, 'Origem'), ...cols.map((a) => el('th', { class: 'num' }, a))]);
      const brows = rows.slice(0, 10).map((r) => el('tr', {}, [el('td', {}, r.origem), ...cols.map((a) => el('td', { class: 'num' }, money(coerceNumber(r.valores[a]))))]));
      clear(preview).appendChild(el('table', {}, [el('thead', {}, head), el('tbody', {}, brows)]));
      if (rows.length > 10) preview.appendChild(el('p', { class: 'hint' }, `+${rows.length - 10} linha(s)…`));
      importBtn.textContent = `Importar ${rows.length} conta(s) e alocar`;
      importBtn.onclick = () => {
        if (!rows.length) { toast('Nada para importar — tente "Ajustar colunas".', 'error'); return; }
        actions.importRows(rows, anos);
        close();
        toast(`${rows.length} conta(s) importada(s) e alocada(s) automaticamente.`, 'ok');
      };
    }
    render();

    body.appendChild(el('div', {}, [
      el('p', { class: 'hint' }, 'Detectei as colunas automaticamente. Confira a prévia e importe — os destinos são preenchidos sozinhos (Memória → Dicionário).'),
      info,
      el('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:8px;margin:6px 0' }, [alocChk, el('span', {}, 'Marcar contas importadas como Alocadas (Sim)')]),
      el('h3', {}, 'Prévia'),
      preview,
    ]));
    foot.appendChild(el('button', { class: 'btn ghost', onclick: goMapping }, 'Ajustar colunas (avançado)'));
    foot.appendChild(el('button', { class: 'btn', onclick: step1 }, 'Voltar'));
    foot.appendChild(importBtn);
  }

  function goMapping() {
    if (!table || !table.length) { showError('Tabela vazia.'); return; }
    clear(body); clear(foot);
    let headerRow = 0;
    let alocPad = 'Sim';
    let mapping = null;

    const hdrInput = el('input', {
      type: 'number', min: '0', value: '0', style: 'width:72px',
      onchange: (e) => { headerRow = Math.max(0, parseInt(e.target.value, 10) || 0); rebuild(); },
    });
    const mapGridWrap = el('div');
    const yearsInfo = el('div', { class: 'hint' });
    const alocChk = el('input', { type: 'checkbox', checked: true, onchange: (e) => { alocPad = e.target.checked ? 'Sim' : 'Não'; renderPreview(); } });
    const preview = el('div', { class: 'table-wrap', style: 'max-height:240px;margin-top:10px' });
    const importBtn = el('button', { class: 'btn primary' }, 'Importar');

    body.appendChild(el('div', {}, [
      el('p', { class: 'hint' }, 'Confirme o cabeçalho e o campo de cada coluna (auto-detectado). Colunas com ano viram valores por período. Em PDF, o título costuma ficar antes do cabeçalho — ajuste a linha se preciso.'),
      el('div', { class: 'toolbar' }, [el('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:6px' }, [el('span', {}, 'Linha do cabeçalho (0 = primeira):'), hdrInput])]),
      mapGridWrap,
      yearsInfo,
      el('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:8px;margin-top:6px' }, [alocChk, el('span', {}, 'Marcar linhas importadas como Alocadas (Sim)')]),
      el('h3', {}, 'Prévia'),
      preview,
    ]));
    foot.appendChild(el('button', { class: 'btn', onclick: step1 }, 'Voltar'));
    foot.appendChild(importBtn);

    function rebuild() {
      const header = (table[headerRow] || []).map((h) => String(h ?? ''));
      mapping = autoGuessMapping(header);
      const colOptions = (selIdx) => el('select', {}, [
        el('option', { value: '' }, '—'),
        ...header.map((h, i) => el('option', { value: String(i), selected: i === selIdx ? true : null }, `${colLetter(i + 1)} · ${h || '(vazio)'}`)),
      ]);
      const mapGrid = el('div', { class: 'map-grid' });
      for (const [field, label] of IMPORT_FIELDS) {
        const sel = colOptions(mapping.fields[field]);
        sel.addEventListener('change', (ev) => { const v = ev.target.value; if (v === '') delete mapping.fields[field]; else mapping.fields[field] = +v; renderPreview(); });
        mapGrid.appendChild(el('label', { class: 'field' }, [label, sel]));
      }
      clear(mapGridWrap).appendChild(mapGrid);
      renderPreview();
    }

    function renderPreview() {
      const anos = effectiveYears(mapping.yearCols);
      yearsInfo.textContent = mapping.yearCols.length
        ? `Anos detectados: ${mapping.yearCols.map((y) => y.ano).join(', ')} — usando ${anos.join(', ') || '—'}`
        : 'Nenhuma coluna de ano detectada — ajuste a linha do cabeçalho, ou digite os valores depois.';
      const { rows, anos: builtAnos } = buildEntryRows(table, mapping, { headerRow, alocacaoPadrao: alocPad });
      const cols = ['origem', 'grupo', 'subCategoria', 'destino', 'alocacaoHierarquia'];
      const head = el('tr', {}, [...cols.map((c) => el('th', {}, c)), ...anos.map((a) => el('th', { class: 'num' }, a))]);
      const bodyRows = rows.slice(0, 8).map((r) => el('tr', {}, [
        ...cols.map((c) => el('td', {}, String(r[c] ?? ''))),
        ...anos.map((a) => el('td', { class: 'num' }, money(coerceNumber(r.valores[a])))),
      ]));
      clear(preview).appendChild(el('table', {}, [el('thead', {}, head), el('tbody', {}, bodyRows)]));
      if (rows.length > 8) preview.appendChild(el('p', { class: 'hint' }, `+${rows.length - 8} linha(s)…`));
      importBtn.textContent = `Importar ${rows.length} linha(s)`;
      importBtn.onclick = () => {
        if (!rows.length) { toast('Nada para importar.', 'error'); return; }
        actions.importRows(rows, builtAnos);
        close();
        toast(`${rows.length} linha(s) importada(s).`, 'ok');
      };
    }

    // auto-detecta a linha do cabeçalho: se a 1ª não tiver colunas de ano,
    // procura nas primeiras linhas uma que tenha (típico de PDF com título).
    const g0 = autoGuessMapping((table[0] || []).map((h) => String(h ?? '')));
    if (!g0.yearCols.length) {
      for (let r = 1; r < Math.min(table.length, 6); r++) {
        const g = autoGuessMapping((table[r] || []).map((h) => String(h ?? '')));
        if (g.yearCols.length) { headerRow = r; hdrInput.value = String(r); break; }
      }
    }
    rebuild();
  }
}

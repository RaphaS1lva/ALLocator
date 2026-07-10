// Visão Shadow — o layout que o especialista conhece do template:
// Ativo, Passivo (+PL) e DRE empilhados, com subtotais em destaque e as
// colunas de memória da planilha original:
//   · Memória anterior  = contas do ÚLTIMO planilhamento do cliente (Supabase)
//   · Memória atual (ajustada) = origens alocadas AGORA na linha — com
//     espaço para ADICIONAR e RETIRAR contas (equivalente às faixas
//     Retirar/Adicionar do template, aplicado direto na Rastreabilidade).
import React, { useMemo, useState } from 'react';
import { normalizeText } from '../core/normalize.js';
import { canonicalDestino } from '../core/planoContas.js';
import { yearSlots } from '../lib/kpis.js';
import { money, shortenPeriods } from '../lib/format.js';

const nk = (destino, grupo, sub) => [normalizeText(destino), normalizeText(grupo), normalizeText(sub)].join('|');

function MemCell({ items, tone }) {
  if (!items.length) return <span className="muted">—</span>;
  const txt = items.join(' + ');
  return (
    <span className={`mem-cell ${tone}`} title={items.map((i) => `(${i})`).join(' + ')}>
      {items.length > 2 ? `${items.slice(0, 2).join(' + ')} +${items.length - 2}` : txt}
    </span>
  );
}

/** Painel expandido de uma conta: memórias + adicionar/retirar origens. */
function LineEditor({
  line, memoriaAnterior, allRows, resultById, onRemoveOrigem, onAddOrigem, onVerRastreio,
}) {
  const [toAdd, setToAdd] = useState('');

  // candidatas a ADICIONAR: linhas Sim que não estão nesta conta e cujo grupo
  // (quando definido) é compatível com a linha (regra absoluta de alocação).
  const candidatas = useMemo(() => {
    const inLine = new Set((line.origemIds || []).map(String));
    return (allRows || []).filter((r) => {
      if (r.alocacaoHierarquia !== 'Sim') return false;
      if (inLine.has(String(r.id))) return false;
      const g = r.grupo || resultById.get(String(r.id))?.grupo || '';
      if (g && normalizeText(g) !== normalizeText(line.grupo)) return false;
      return String(r.origem || '').trim() !== '';
    });
  }, [allRows, line, resultById]);

  const alocadas = (line.origemIds || []).map((id, i) => ({ id, origem: line.origens[i] }));

  return (
    <div className="line-editor">
      <div className="le-col">
        <div className="le-title">Memória anterior <span className="muted">(último planilhamento)</span></div>
        {memoriaAnterior.length
          ? memoriaAnterior.map((m, i) => <span key={i} className="chip gray" title={`(${m.origem}|${m.grupo}|${m.subCategoria})`}>{m.origem}</span>)
          : <span className="muted" style={{ fontSize: 12 }}>vazia — será preenchida quando houver análise salva deste cliente</span>}
      </div>
      <div className="le-col">
        <div className="le-title">Memória atual (ajustada) <span className="muted">— clique no ✕ para retirar</span></div>
        {alocadas.length
          ? alocadas.map((a) => (
            <span key={a.id} className="chip blue">
              {a.origem}
              <button className="chip-x" title={`Retirar "${a.origem}" desta conta (volta para "sem destino")`} onClick={() => onRemoveOrigem(a.id)}>✕</button>
            </span>
          ))
          : <span className="muted" style={{ fontSize: 12 }}>nenhuma origem alocada nesta conta</span>}
        <div className="row" style={{ marginTop: 10 }}>
          <select className="input" style={{ maxWidth: 320, padding: '6px 10px', fontSize: 12.5 }} value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
            <option value="">+ Adicionar conta a esta linha…</option>
            {candidatas.map((c) => {
              const atual = resultById.get(String(c.id))?.destino || c.destino;
              return (
                <option key={c.id} value={c.id}>
                  {c.origem}{atual ? ` (hoje em: ${atual})` : ' (sem destino)'}
                </option>
              );
            })}
          </select>
          <button
            className="btn sm"
            disabled={!toAdd}
            onClick={() => { onAddOrigem(toAdd, line); setToAdd(''); }}
          >
            Adicionar
          </button>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={() => onVerRastreio(line.destino)}>ver na Rastreabilidade ↓</button>
        </div>
      </div>
    </div>
  );
}

function SectionTable({
  title, rows, slots, hideZeros, memIndex, expanded, setExpanded,
  allRows, resultById, onRemoveOrigem, onAddOrigem, onVerRastreio,
}) {
  const shortAnos = shortenPeriods(slots.map((s) => s.year));
  const visible = rows.filter((r) => {
    if (r.tipo === 'subtotal') return true;
    if (expanded === nk(r.destino, r.grupo, r.subCategoria)) return true; // linha em edição nunca some
    if (!hideZeros) return true;
    return slots.some(({ slot }) => Math.abs(Number(r[slot]) || 0) > 0.005)
      || (r.origens?.length > 0)
      || (memIndex.get(nk(r.destino, r.grupo, r.subCategoria)) || []).length > 0;
  });
  const nCols = 3 + slots.length + 1; // conta + anos + 2 memórias + chevron? => computed below
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="card-body" style={{ paddingTop: 12 }}>
        <div className="table-wrap">
          <table className="tbl shadow-tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Conta</th>
                {slots.map(({ year }) => <th key={year} style={{ textAlign: 'right' }} title={String(year)}>{shortAnos.get(String(year))}</th>)}
                <th style={{ minWidth: 140 }}>Memória anterior</th>
                <th style={{ minWidth: 180 }}>Memória atual (ajustada)</th>
                <th style={{ width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const isSub = r.tipo === 'subtotal';
                const key = nk(r.destino, r.grupo, r.subCategoria);
                const memAnt = memIndex.get(key) || [];
                const isOpen = expanded === key;
                return (
                  <React.Fragment key={`${r.row}|${r.destino}`}>
                    <tr
                      className={`${isSub ? 'subtotal' : 'conta'}${isOpen ? ' selected' : ''}`}
                      onClick={() => { if (!isSub) setExpanded(isOpen ? null : key); }}
                      title={isSub ? 'Subtotal calculado pelo template' : 'Clique para ver as memórias e adicionar/retirar contas desta linha'}
                    >
                      <td className={isSub ? '' : 'conta-nome'}>{r.destino}</td>
                      {slots.map(({ year, slot }) => (
                        <td key={year} className="num">{money(r[slot])}</td>
                      ))}
                      <td>{isSub ? '' : <MemCell items={memAnt.map((m) => m.origem)} tone="gray" />}</td>
                      <td>{isSub ? '' : <MemCell items={r.origens || []} tone="blue" />}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{isSub ? '' : (isOpen ? '▾' : '▸')}</td>
                    </tr>
                    {isOpen && !isSub && (
                      <tr className="editor-row">
                        <td colSpan={slots.length + 4}>
                          <LineEditor
                            line={r}
                            memoriaAnterior={memAnt}
                            allRows={allRows}
                            resultById={resultById}
                            onRemoveOrigem={onRemoveOrigem}
                            onAddOrigem={onAddOrigem}
                            onVerRastreio={onVerRastreio}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ShadowView({
  result, memory, allRows, resultById, onRemoveOrigem, onAddOrigem, onVerRastreio,
}) {
  const slots = yearSlots(result.years);
  const [hideZeros, setHideZeros] = useState(true);
  const [expanded, setExpanded] = useState(null);

  // índice da MEMÓRIA ANTERIOR por chave estrutural do destino
  const memIndex = useMemo(() => {
    const idx = new Map();
    for (const m of memory || []) {
      // destinos salvos podem usar grafia antiga -> verter para o nome canônico
      const k = nk(canonicalDestino(m.destino, m.grupo, m.subCategoria), m.grupo, m.subCategoria);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(m);
    }
    return idx;
  }, [memory]);

  const { ativo, passivo } = useMemo(() => {
    const ap = result.shadow.ativoPassivo || [];
    const idx = ap.findIndex((r) => normalizeText(r.destino) === normalizeText('TOTAL ATIVO'));
    return {
      ativo: idx >= 0 ? ap.slice(0, idx + 1) : ap,
      passivo: idx >= 0 ? ap.slice(idx + 1) : [],
    };
  }, [result]);

  const common = {
    slots, hideZeros, memIndex, expanded, setExpanded, allRows, resultById, onRemoveOrigem, onAddOrigem, onVerRastreio,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
          ocultar linhas zeradas
        </label>
      </div>
      <SectionTable title="Ativo" rows={ativo} {...common} />
      <SectionTable title="Passivo e Patrimônio Líquido" rows={passivo} {...common} />
      <SectionTable title="DRE" rows={result.shadow.dre || []} {...common} />
    </div>
  );
}

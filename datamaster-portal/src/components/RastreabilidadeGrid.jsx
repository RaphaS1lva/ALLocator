// Grid editável da Rastreabilidade — mesmas colunas do template (A..L),
// na mesma ordem; só ficam de fora "Chave" e "Chave Destino" (M/N), que são
// fórmulas derivadas escritas na exportação.
//   Origem | Hierarquia | Totalizador | Alocação | Página | Ano 1..3 |
//   Grupo | Sub Categoria | Destino no Template | Tipo de Mapeamento
import React from 'react';
import { CONTAS_ALOCAVEIS } from '../core/planoContas.js';
import { shortenPeriods } from '../lib/format.js';

const TIPO_PILL = {
  'Memoria Anterior': ['teal', 'memória'],
  'Dicionário': ['blue', 'dicionário'],
  Julgamental: ['amber', 'julgamental'],
};

const SUBS = { Ativo: ['Circulante', 'Não Circulante'], Passivo: ['Circulante', 'Não Circulante', 'PL'], DRE: ['DRE'] };

function DestinoSelect({ row, onChange }) {
  const opts = CONTAS_ALOCAVEIS.filter((c) => {
    if (row.grupo && c.grupo !== row.grupo) return false;
    if (row.subCategoria && c.subCategoria !== row.subCategoria) return false;
    return true;
  });
  const hasCurrent = !row.destino || opts.some((o) => o.destino === row.destino);
  return (
    <select
      className="cell-input"
      style={{ minWidth: 170 }}
      value={row.destino || ''}
      onChange={(e) => {
        const dest = e.target.value;
        const acc = CONTAS_ALOCAVEIS.find((c) => c.destino === dest
          && (!row.grupo || c.grupo === row.grupo)
          && (!row.subCategoria || c.subCategoria === row.subCategoria))
          || CONTAS_ALOCAVEIS.find((c) => c.destino === dest);
        onChange(dest, acc);
      }}
    >
      <option value="">— sem destino —</option>
      {!hasCurrent && <option value={row.destino}>{row.destino} (fora do plano)</option>}
      {opts.map((o) => (
        <option key={`${o.destino}|${o.grupo}|${o.subCategoria}`} value={o.destino}>
          {o.destino}
        </option>
      ))}
    </select>
  );
}

export default function RastreabilidadeGrid({
  rows, anos, resultById, onUpdate, onUpdateValor, onDelete, onAdd,
}) {
  const shortAnos = shortenPeriods(anos); // só a data no cabeçalho (hover = rótulo completo)
  return (
    <div>
      <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 170 }}>Origem</th>
              <th style={{ minWidth: 120 }}>Hierarquia</th>
              <th title="Derivado: a origem é conta-pai de alguma abertura">Totalizador</th>
              <th title="Sim = conta no template · Não = contexto p/ revisão">Alocação</th>
              <th style={{ minWidth: 64 }}>Página</th>
              {anos.map((a) => <th key={a} style={{ textAlign: 'right' }} title={String(a)}>{shortAnos.get(String(a))}</th>)}
              <th>Grupo</th>
              <th>Sub Categoria</th>
              <th style={{ minWidth: 170 }}>Destino no Template</th>
              <th>Tipo de Mapeamento</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const res = resultById.get(String(r.id));
              const tp = TIPO_PILL[res?.tipoMapeamento];
              const isSim = r.alocacaoHierarquia === 'Sim';
              const isTot = res?.totalizador === 'Sim';
              return (
                <tr key={r.id} style={isSim ? undefined : { opacity: 0.62 }}>
                  <td>
                    <input className="cell-input" value={r.origem} placeholder="nome da conta"
                      onChange={(e) => onUpdate(r.id, { origem: e.target.value })} />
                  </td>
                  <td>
                    {/* Regra §12: totalizador e top-level exibem o PRÓPRIO nome
                        (hierarquiaDisplay); aberturas exibem o pai imediato.
                        Editar aqui altera o pai estrutural (valor cru). */}
                    <input className="cell-input" style={{ minWidth: 110 }}
                      value={res?.hierarquiaDisplay ?? r.hierarquia}
                      placeholder="conta-pai"
                      title={isTot ? `Totalizador: exibe o próprio nome (pai estrutural: ${r.hierarquia || '—'})` : ''}
                      onChange={(e) => onUpdate(r.id, { hierarquia: e.target.value })} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {isTot
                      ? <span className="pill teal" title="Conta-pai: aparece como Hierarquia de alguma abertura">Sim</span>
                      : <span className="muted">Não</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className={`pill ${isSim ? 'green' : 'gray'}`}
                      style={{ border: 0, cursor: 'pointer' }}
                      onClick={() => onUpdate(r.id, { alocacaoHierarquia: isSim ? 'Não' : 'Sim' })}
                    >
                      {isSim ? 'Sim' : 'Não'}
                    </button>
                  </td>
                  <td>
                    <input className="cell-input" style={{ minWidth: 52, maxWidth: 70 }} value={r.paginaReferencia} placeholder="—"
                      onChange={(e) => onUpdate(r.id, { paginaReferencia: e.target.value })} />
                  </td>
                  {anos.map((a) => (
                    <td key={a} className="num">
                      <input className="cell-input" style={{ textAlign: 'right', minWidth: 84 }}
                        value={r.valores?.[a] ?? ''}
                        placeholder="—"
                        onChange={(e) => onUpdateValor(r.id, a, e.target.value)} />
                    </td>
                  ))}
                  <td>
                    <select className="cell-input" style={{ minWidth: 80 }} value={r.grupo}
                      onChange={(e) => {
                        const grupo = e.target.value;
                        const subs = SUBS[grupo] || [];
                        onUpdate(r.id, { grupo, subCategoria: subs.includes(r.subCategoria) ? r.subCategoria : (subs[0] || ''), destino: '' });
                      }}>
                      <option value="">—</option>
                      <option>Ativo</option><option>Passivo</option><option>DRE</option>
                    </select>
                  </td>
                  <td>
                    <select className="cell-input" style={{ minWidth: 104 }} value={r.subCategoria}
                      onChange={(e) => onUpdate(r.id, { subCategoria: e.target.value, destino: '' })}>
                      <option value="">—</option>
                      {(SUBS[r.grupo] || ['Circulante', 'Não Circulante', 'PL', 'DRE']).map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <DestinoSelect row={r} onChange={(dest, acc) => onUpdate(r.id, {
                      destino: dest,
                      ...(acc ? { grupo: acc.grupo, subCategoria: acc.subCategoria } : {}),
                      tipoMapeamento: dest ? (r.tipoMapeamento || 'Julgamental') : '',
                    })} />
                  </td>
                  <td>
                    {tp
                      ? <span className={`pill ${tp[0]}`} title={res?.justificativa || ''}>{tp[1]}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td>
                    <button className="btn sm ghost danger" title="Remover linha" onClick={() => onDelete(r.id)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row mt-16">
        <button className="btn sm" onClick={onAdd}>+ Adicionar linha</button>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Colunas do template (A–L); Chave e Chave Destino são geradas na exportação. Linhas "Não" são contexto: não somam no template.
        </span>
      </div>
    </div>
  );
}

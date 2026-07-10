import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { normalizeText } from '../core/normalize.js';
import { CONTAS_ALOCAVEIS } from '../core/planoContas.js';

const FONTE_PILL = { seed: ['gray', 'base'], aprendido: ['teal', 'aprendida'], manual: ['blue', 'manual'] };
const EMPTY = { origem: '', destino: '', grupo: 'Ativo', subCategoria: 'Circulante' };

export default function Dicionario() {
  const { dicionario, repo, refreshDicionario, toast } = useApp();
  const [q, setQ] = useState('');
  const [fonte, setFonte] = useState('todas');
  const [form, setForm] = useState(null);

  const filtered = useMemo(() => {
    const nq = normalizeText(q);
    return dicionario
      .filter((e) => (fonte === 'todas' ? true : e.fonte === fonte))
      .filter((e) => !nq || normalizeText(e.origem).includes(nq) || normalizeText(e.destino).includes(nq))
      .slice(0, 400);
  }, [dicionario, q, fonte]);

  const counts = useMemo(() => {
    const c = { seed: 0, aprendido: 0, manual: 0 };
    for (const e of dicionario) c[e.fonte] = (c[e.fonte] || 0) + 1;
    return c;
  }, [dicionario]);

  async function save(e) {
    e.preventDefault();
    try {
      await repo.upsertDicionarioEntry(form);
      await refreshDicionario();
      toast('Regra adicionada ao dicionário.', 'ok');
      setForm(null);
    } catch (err) { toast(err.message, 'error'); }
  }

  const destinos = CONTAS_ALOCAVEIS.filter((c) => (form ? c.grupo === form.grupo : true));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Conhecimento</div>
          <h1>Dicionário de contas</h1>
          <p className="sub">
            {counts.seed?.toLocaleString('pt-BR')} regras da base oficial · {counts.aprendido || 0} aprendidas com suas análises · {counts.manual || 0} manuais.
            Cada alocação confirmada ensina o sistema.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>+ Nova regra</button>
        </div>
      </div>

      {form && (
        <div className="card mb-16">
          <div className="card-head"><h3>Nova regra manual</h3></div>
          <div className="card-body">
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="field"><label>Origem (como aparece no documento) *</label>
                  <input className="input" required value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} /></div>
                <div className="field"><label>Grupo</label>
                  <select className="input" value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value, destino: '' })}>
                    <option>Ativo</option><option>Passivo</option><option>DRE</option>
                  </select></div>
                <div className="field"><label>Sub Categoria</label>
                  <select className="input" value={form.subCategoria} onChange={(e) => setForm({ ...form, subCategoria: e.target.value })}>
                    <option>Circulante</option><option>Não Circulante</option><option>PL</option><option>DRE</option>
                  </select></div>
                <div className="field"><label>Destino no template *</label>
                  <select className="input" required value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })}>
                    <option value="">Selecione…</option>
                    {destinos.map((d) => <option key={`${d.destino}|${d.grupo}|${d.subCategoria}`} value={d.destino}>{d.destino} · {d.subCategoria}</option>)}
                  </select></div>
              </div>
              <div className="row mt-16">
                <button className="btn primary">Salvar regra</button>
                <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <div className="row mb-16">
            <input className="input" style={{ maxWidth: 360 }} placeholder="Buscar por origem ou destino…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" style={{ maxWidth: 180 }} value={fonte} onChange={(e) => setFonte(e.target.value)}>
              <option value="todas">Todas as fontes</option>
              <option value="seed">Base oficial</option>
              <option value="aprendido">Aprendidas</option>
              <option value="manual">Manuais</option>
            </select>
            <span className="muted" style={{ fontSize: 12.5 }}>{filtered.length} exibidas</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Origem</th><th>Destino no template</th><th>Grupo</th><th>Sub</th><th>Fonte</th><th /></tr></thead>
              <tbody>
                {filtered.map((e, i) => {
                  const [cls, label] = FONTE_PILL[e.fonte] || FONTE_PILL.seed;
                  return (
                    <tr key={e.id || i}>
                      <td>{e.origem}</td>
                      <td style={{ fontWeight: 600 }}>{e.destino}</td>
                      <td>{e.grupo}</td>
                      <td>{e.subCategoria}</td>
                      <td><span className={`pill ${cls}`}>{label}</span></td>
                      <td>
                        {e.fonte !== 'seed' && e.id && (
                          <button className="btn sm ghost danger" onClick={async () => { await repo.deleteDicionarioEntry(e.id); await refreshDicionario(); }}>✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

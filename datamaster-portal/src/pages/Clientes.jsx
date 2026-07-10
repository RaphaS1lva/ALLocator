import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { fmtCnpj } from '../lib/format.js';

const EMPTY = { nome: '', cnpj: '', grupo: '', setor: '' };

export default function Clientes() {
  const { repo, toast } = useApp();
  const [clientes, setClientes] = useState(null);
  const [form, setForm] = useState(null); // null = fechado; {} = novo/edição
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const refresh = () => repo.listClientes().then(setClientes).catch(() => setClientes([]));
  useEffect(() => { refresh(); }, [repo]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await repo.upsertCliente(form);
      toast('Cliente salvo.', 'ok');
      setForm(null);
      refresh();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  async function remove(c) {
    if (!window.confirm(`Remover o cliente "${c.nome}"? As análises já salvas são mantidas.`)) return;
    await repo.deleteCliente(c.id);
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Carteira</div>
          <h1>Carteira de clientes</h1>
          <p className="sub">As empresas que você acompanha. A memória anterior de cada cliente vem do último planilhamento salvo.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>+ Novo cliente</button>
        </div>
      </div>

      {form && (
        <div className="card mb-16">
          <div className="card-head"><h3>{form.id ? 'Editar cliente' : 'Novo cliente'}</h3></div>
          <div className="card-body">
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="field"><label>Razão social *</label>
                  <input className="input" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div className="field"><label>CNPJ</label>
                  <input className="input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
                <div className="field"><label>Grupo econômico</label>
                  <input className="input" value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value })} /></div>
                <div className="field"><label>Setor</label>
                  <input className="input" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} /></div>
              </div>
              <div className="row mt-16">
                <button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Salvar'}</button>
                <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          {!clientes && <div className="empty"><span className="spinner" /></div>}
          {clientes && !clientes.length && (
            <div className="empty">
              <div className="icon">🏢</div>
              <p>Sua carteira está vazia. Cadastre o primeiro cliente para vincular análises e ativar a memória anterior.</p>
            </div>
          )}
          {clientes && clientes.length > 0 && (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Empresa</th><th>CNPJ</th><th>Grupo</th><th>Setor</th><th style={{ width: 200 }} /></tr></thead>
                <tbody>
                  {clientes.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.nome}</td>
                      <td className="mono">{fmtCnpj(c.cnpj)}</td>
                      <td>{c.grupo || '—'}</td>
                      <td>{c.setor || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn sm" onClick={() => navigate('/analise', { state: { clienteId: c.id } })}>Nova análise</button>{' '}
                        <button className="btn sm ghost" onClick={() => setForm({ ...c })}>Editar</button>{' '}
                        <button className="btn sm ghost danger" onClick={() => remove(c)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

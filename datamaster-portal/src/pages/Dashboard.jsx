import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { dt, fmtCnpj } from '../lib/format.js';

const PROVIDER_LABEL = {
  gemini: 'Google Gemini',
  groq: 'Groq (Llama 3.3)',
  openrouter: 'OpenRouter',
  'hf-router': 'Hugging Face (router)',
  hf: 'Hugging Face (Tucano)',
};

function UsageCard() {
  const { apiStatus, isApiConfigured } = useApp();
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!isApiConfigured || !apiStatus.online) return undefined;
    let alive = true;
    const load = () => api.usage().then((u) => { if (alive) setUsage(u); }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [isApiConfigured, apiStatus.online]);

  if (!isApiConfigured || !apiStatus.online) return null;
  const provs = Object.entries(usage?.providers || {});
  return (
    <div className="card mt-24">
      <div className="card-head">
        <h3>Consumo de IA</h3>
        <span className="pill gray" title="Contadores desde o último boot da API; limites de free tier aproximados (edite via USAGE_LIMITS_JSON)">
          desde {usage ? dt(new Date(usage.since * 1000).toISOString()) : '…'}
        </span>
      </div>
      <div className="card-body">
        {!provs.length && <p className="muted" style={{ fontSize: 12.5 }}>Nenhuma chamada de LLM registrada ainda nesta sessão da API.</p>}
        {provs.map(([k, v]) => {
          const lim = usage?.limits?.[k] || {};
          const pct = lim.rpd ? Math.min(100, (v.requests / lim.rpd) * 100) : null;
          return (
            <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{PROVIDER_LABEL[k] || k}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {v.requests} req{lim.rpd ? ` / ~${lim.rpd} dia` : ''} · {(v.tokens_in + v.tokens_out).toLocaleString('pt-BR')} tokens
                  {v.errors > 0 && <span className="pill red" style={{ marginLeft: 8 }} title={v.last_error}>{v.errors} erros</span>}
                </span>
              </div>
              {pct != null && (
                <div className="meter" title={`${v.requests} de ~${lim.rpd} requisições/dia (${lim.nota || ''})`}>
                  <i style={{ width: `${pct}%`, background: pct > 80 ? 'var(--red)' : (pct > 50 ? 'var(--amber)' : 'var(--accent)') }} />
                </div>
              )}
            </div>
          );
        })}
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          Limites de free tier são aproximados e reiniciam diariamente (Gemini/Groq/OpenRouter) ou mensalmente (HF).
          Contadores zeram quando a API reinicia.
        </p>
      </div>
    </div>
  );
}

const STATUS_PILL = {
  concluida: ['green', 'Concluída'],
  em_revisao: ['amber', 'Em revisão'],
  rascunho: ['gray', 'Rascunho'],
};

export default function Dashboard() {
  const { repo, dicionario, session } = useApp();
  const [analises, setAnalises] = useState(null);
  const [clientes, setClientes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    repo.listAnalises().then(setAnalises).catch(() => setAnalises([]));
    repo.listClientes().then(setClientes).catch(() => setClientes([]));
  }, [repo]);

  const aprendidas = dicionario.filter((d) => d.fonte === 'aprendido' || d.fonte === 'manual').length;
  const fechadas = (analises || []).filter((a) => a.balanco_fechado).length;
  const firstName = (session?.user?.email || '').split('@')[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Visão geral</div>
          <h1>Olá, {firstName} 👋</h1>
          <p className="sub">Acompanhe sua carteira e os planilhamentos processados pela plataforma.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => navigate('/analise')}>+ Nova análise</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat accent">
          <div className="k">Análises</div>
          <div className="v">{analises ? analises.length : '…'}</div>
          <div className="d">planilhamentos na base</div>
        </div>
        <div className="stat ok">
          <div className="k">Balanços fechados</div>
          <div className="v">{analises ? fechadas : '…'}</div>
          <div className="d">com A = P + PL validado</div>
        </div>
        <div className="stat">
          <div className="k">Clientes</div>
          <div className="v">{clientes.length}</div>
          <div className="d">na sua carteira</div>
        </div>
        <div className="stat">
          <div className="k">Dicionário</div>
          <div className="v">{dicionario.length.toLocaleString('pt-BR')}</div>
          <div className="d">{aprendidas} regras aprendidas com você</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Análises recentes</h3>
          <Link to="/analise" className="btn sm ghost">Nova análise →</Link>
        </div>
        <div className="card-body">
          {!analises && <div className="empty"><span className="spinner" /></div>}
          {analises && !analises.length && (
            <div className="empty">
              <div className="icon">📄</div>
              <p>Nenhuma análise ainda. Crie a primeira: envie um balanço e deixe a IA guiar o planilhamento.</p>
              <button className="btn primary mt-16" onClick={() => navigate('/analise')}>Começar agora</button>
            </div>
          )}
          {analises && analises.length > 0 && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Empresa</th><th>CNPJ</th><th>Períodos</th><th>Linhas</th><th>Balanço</th><th>Status</th><th>Atualizada</th></tr>
                </thead>
                <tbody>
                  {analises.slice(0, 12).map((a) => {
                    const [pillCls, pillLabel] = STATUS_PILL[a.status] || STATUS_PILL.rascunho;
                    return (
                      <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/analise/${a.id}`)}>
                        <td style={{ fontWeight: 600 }}>{a.empresa || '(sem nome)'}</td>
                        <td className="mono">{fmtCnpj(a.cnpj)}</td>
                        <td>{Array.isArray(a.anos) ? a.anos.join(' · ') : ''}</td>
                        <td className="num">{a.n_linhas ?? '—'}</td>
                        <td>{a.balanco_fechado
                          ? <span className="pill green">A = P + PL ✓</span>
                          : <span className="pill amber">aberto</span>}
                        </td>
                        <td><span className={`pill ${pillCls}`}>{pillLabel}</span></td>
                        <td className="muted">{dt(a.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <UsageCard />
    </>
  );
}

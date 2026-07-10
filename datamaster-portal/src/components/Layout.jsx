import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  sun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.3 11.3 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  out: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  chevL: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  chevR: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
};

export default function Layout({ children }) {
  const {
    session, signOut, theme, setTheme, demoMode, apiStatus, isApiConfigured,
  } = useApp();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dm:sidebar') === '1');

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem('dm:sidebar', c ? '0' : '1');
      return !c;
    });
  };

  return (
    <div className="shell">
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="logo">
          <span className="mark">▦</span>
          <span className="lbl">
            DataMaster
            <small>Allocator · IA contábil</small>
          </span>
          <button className="collapse-btn" onClick={toggle} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? I.chevR : I.chevL}
          </button>
        </div>

        <button
          className="new-analysis"
          onClick={() => navigate('/analise')}
          title="Nova análise"
        >
          {I.plus} <span className="lbl">Nova análise</span>
        </button>

        <div className="nav-section lbl">Plataforma</div>
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title="Visão geral">
          {I.home} <span className="lbl">Visão geral</span>
        </NavLink>
        <NavLink to="/clientes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title="Carteira de clientes">
          {I.users} <span className="lbl">Carteira de clientes</span>
        </NavLink>
        <NavLink to="/dicionario" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title="Dicionário de contas">
          {I.book} <span className="lbl">Dicionário de contas</span>
        </NavLink>

        <div className="foot">
          <div className="row lbl" style={{ gap: 8 }}>
            <span className="pill" style={{ background: 'rgba(255,255,255,.08)', color: demoMode ? '#fbbf24' : '#6ee7b7' }}>
              {demoMode ? '● modo demo' : '● Supabase'}
            </span>
            {isApiConfigured && (
              <span className="pill" style={{ background: 'rgba(255,255,255,.08)', color: apiStatus.online ? '#6ee7b7' : '#f87171' }}>
                {apiStatus.online ? '● IA online' : '● IA offline'}
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            <button className="nav-item icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Alternar tema">
              {I.sun}
            </button>
            <button className="nav-item icon-btn" style={{ flex: collapsed ? 'none' : 1 }} onClick={signOut} title={`Sair (${session?.user?.email || ''})`}>
              {I.out} <span className="lbl" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session?.user?.email}</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}

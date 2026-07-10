import React, { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function Login() {
  const { signIn, signUp, toast } = useApp();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else {
        await signUp(email, password);
        toast('Conta criada! Verifique seu e-mail para confirmar o cadastro.', 'ok');
      }
    } catch (err) {
      toast(err.message || 'Falha na autenticação', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo-row">
          <span className="mark">▦</span>
          <div>
            <h2 style={{ fontSize: 18 }}>DataMaster · Allocator</h2>
            <p className="muted" style={{ fontSize: 12.5 }}>Planilhamento de balanços com IA</p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>E-mail</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
          </div>
          <div className="field">
            <label>Senha</label>
            <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn primary" style={{ justifyContent: 'center', padding: '11px' }} disabled={busy}>
            {busy ? <span className="spinner" /> : (mode === 'signin' ? 'Entrar' : 'Criar conta')}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 18, fontSize: 13, textAlign: 'center' }}>
          {mode === 'signin' ? (
            <>Não tem conta? <a href="#/" onClick={(e) => { e.preventDefault(); setMode('signup'); }}>Cadastre-se</a></>
          ) : (
            <>Já tem conta? <a href="#/" onClick={(e) => { e.preventDefault(); setMode('signin'); }}>Entrar</a></>
          )}
        </p>
      </div>
    </div>
  );
}

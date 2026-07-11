// Contexto global: sessão de auth, repositório, dicionário e toasts.
import React, {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
} from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { createRepo } from '../lib/repo.js';
import { api, isApiConfigured } from '../lib/api.js';
import { canonicalDestino, isValidDestino } from '../core/planoContas.js';

/** Regra aprendida/memorizada só vale se o destino existir no plano de
 * contas — protege contra poluição de análises antigas salvas com erro. */
export function entradaValida(e) {
  const d = canonicalDestino(e.destino, e.grupo, e.subCategoria);
  return isValidDestino(d, e.grupo, e.subCategoria);
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const repo = useMemo(() => createRepo(), []);
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [dicionario, setDicionario] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [apiStatus, setApiStatus] = useState({ online: false, providers: [] });
  const [theme, setTheme] = useState(() => localStorage.getItem('dm:theme') || 'light');

  // ---------- auth ----------
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // modo demo: sessão fictícia local
      setSession({ user: { email: 'demo@datamaster.local', id: 'demo' }, demo: true });
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    else window.location.reload();
  }, []);

  // ---------- dicionário ----------
  const refreshDicionario = useCallback(async () => {
    try {
      const all = await repo.getDicionario();
      setDicionario(all.filter(entradaValida));
    } catch (e) { console.error(e); }
  }, [repo]);

  useEffect(() => { if (session) refreshDicionario(); }, [session, refreshDicionario]);

  // ---------- API de IA (re-checa a cada 45s: status não pode "congelar") ----------
  useEffect(() => {
    if (!isApiConfigured) return undefined;
    const check = () => api.health()
      .then((h) => setApiStatus({ online: true, providers: h.providers || [] }))
      .catch(() => setApiStatus({ online: false, providers: [] }));
    check();
    const t = setInterval(check, 45000);
    return () => clearInterval(t);
  }, []);

  // erros assíncronos que escapam dos try/catch (ex.: parser de PDF) viram
  // toast em vez de falha silenciosa
  useEffect(() => {
    const h = (e) => {
      const msg = e?.reason?.message || String(e?.reason || 'erro desconhecido');
      toast(`Erro inesperado: ${msg.slice(0, 160)}`, 'error');
    };
    window.addEventListener('unhandledrejection', h);
    return () => window.removeEventListener('unhandledrejection', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- tema ----------
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dm:theme', theme);
  }, [theme]);

  // ---------- toasts ----------
  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = {
    repo, session, signIn, signUp, signOut,
    dicionario, refreshDicionario,
    apiStatus, isApiConfigured,
    theme, setTheme,
    toast,
    demoMode: !isSupabaseConfigured,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}

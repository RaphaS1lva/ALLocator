import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clientes from './pages/Clientes.jsx';
import Analise from './pages/Analise.jsx';
import Dicionario from './pages/Dicionario.jsx';

export default function App() {
  const { session } = useApp();

  if (session === undefined) {
    return (
      <div className="auth-wrap"><span className="spinner" /></div>
    );
  }
  if (!session) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/analise" element={<Analise />} />
        <Route path="/analise/:id" element={<Analise />} />
        <Route path="/dicionario" element={<Dicionario />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

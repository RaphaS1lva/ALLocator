export function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function dt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

/** "30/04/2026 Orçado" -> "30/04/2026" · "Dezembro/24" -> "Dezembro/24" · "2025 Realizado" -> "2025" */
export function periodShort(label) {
  const s = String(label || '').trim();
  const m = s.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)
    || s.match(/\b[\p{L}]+\/\d{2,4}\b/u)
    || s.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : s;
}

/** Encurta um conjunto de rótulos de período, mantendo o completo se houver colisão. */
export function shortenPeriods(labels) {
  const shorts = (labels || []).map(periodShort);
  const unique = new Set(shorts).size === shorts.length;
  const map = new Map();
  (labels || []).forEach((l, i) => map.set(String(l), unique ? shorts[i] : String(l)));
  return map;
}

export function fmtCnpj(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 14) return v || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

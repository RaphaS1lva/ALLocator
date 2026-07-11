// Workspace da análise — fluxo guiado em 4 etapas:
// 1 Documento -> 2 Confirmação (chat: a IA apresenta o que LEU e pede
// confirmação, como no CustomGPT / Guia §5) -> 3 Revisão (layout Shadow,
// como o especialista trabalha; Rastreabilidade no micro) -> 4 Resultado.
// O pipeline contábil roda 100% no navegador a cada edição.
import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useApp, entradaValida } from '../context/AppContext.jsx';
import { runPipeline } from '../core/index.js';
import { CONTAS_ALOCAVEIS } from '../core/planoContas.js';
import { coerceNumber, normalizeText } from '../core/normalize.js';
import { readFile, parseDelimited } from '../import/readers.js';
import { autoDetect, buildEntryRows, buildRowsPositional } from '../import/mapping.js';
import { downloadWorkbook } from '../excel/exportWorkbook.js';
import { api } from '../lib/api.js';
import RastreabilidadeGrid from '../components/RastreabilidadeGrid.jsx';
import ShadowView from '../components/ShadowView.jsx';
import { computeAnalysis, fmtKpi, yearSlots } from '../lib/kpis.js';
import { money } from '../lib/format.js';

const uid = () => crypto.randomUUID();
const STEPS = ['Documento', 'Confirmação', 'Revisão', 'Resultado'];

function newRow(patch = {}) {
  return {
    id: uid(), origem: '', hierarquia: '', paginaReferencia: '', codigo: '',
    grupo: '', subCategoria: '', destino: '', alocacaoHierarquia: 'Sim',
    tipoMapeamento: '', valores: {}, ...patch,
  };
}

/** Reconstrói valores por ano a partir de uma linha salva (ano1/2/3 -> anos reais). */
function rebuildEditableRow(r, anos) {
  const valores = {};
  const slots = [r.ano1, r.ano2, r.ano3];
  const offset = 3 - (anos ? anos.length : 0);
  (anos || []).forEach((y, i) => { const v = slots[offset + i]; if (v != null) valores[y] = v; });
  return newRow({ ...r, id: r.id || uid(), alocacaoHierarquia: r.alocacaoHierarquia === 'Sim' ? 'Sim' : 'Não', valores });
}

const LL_RE = /(lucro|resultado)\s+l[ií]quido(?!.*(antes|distribu|abrang|ajust))/i;

export default function Analise() {
  const {
    repo, dicionario, toast, apiStatus, isApiConfigured,
  } = useApp();
  const { id: analiseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState(location.state?.clienteId || '');
  const [header, setHeader] = useState({
    empresa: '', cnpj: '', grupo: '', unidade: 'Mil', moeda: 'BRL', isBalancete: false,
  });
  const [rows, setRows] = useState([]);
  const [anos, setAnos] = useState([]);
  const [memory, setMemory] = useState([]);
  const [sourceInfo, setSourceInfo] = useState(null);
  const [confirm, setConfirm] = useState({
    bp: 'A', dre: 'A', periodos: 'A', unidade: 'A', ll: 'A',
  });
  const [paginasMeta, setPaginasMeta] = useState(null); // {bp:[], dre:[]} da extração IA
  const [bpPagesText, setBpPagesText] = useState('');
  const [drePagesText, setDrePagesText] = useState('');
  const [editAnos, setEditAnos] = useState(false);
  // Períodos a planilhar (documentos com várias colunas: Orçado/Realizado etc.)
  const [periodSel, setPeriodSel] = useState('A'); // A = todos · B = escolher
  const [periodChecks, setPeriodChecks] = useState([]);
  // Visões/escopos do documento (Controladora/Consolidado/Individual — Guia §5.1)
  const [visoes, setVisoes] = useState([]);
  const [visaoSel, setVisaoSel] = useState(''); // rótulo escolhido · 'AMBAS' · '' = n/a
  const julgTried = useRef(new Set()); // evita re-tentar julgamental nas mesmas linhas
  const [busy, setBusy] = useState('');
  const [iaMsg, setIaMsg] = useState('');
  const [savedId, setSavedId] = useState(analiseId || null);
  const [parecerIA, setParecerIA] = useState('');
  const [selectedDestino, setSelectedDestino] = useState(null);
  const [showRastreio, setShowRastreio] = useState(false);
  const [rastreioQuery, setRastreioQuery] = useState('');
  const fileRef = useRef(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  /* ---------------- dados iniciais ---------------- */
  useEffect(() => { repo.listClientes().then(setClientes).catch(() => {}); }, [repo]);

  useEffect(() => {
    if (!analiseId) return;
    (async () => {
      const a = await repo.getAnalise(analiseId);
      if (!a) { toast('Análise não encontrada.', 'error'); return; }
      setHeader({
        empresa: a.empresa || '', cnpj: a.cnpj || '', grupo: a.grupo || '',
        unidade: a.unidade || 'Mil', moeda: a.moeda || 'BRL', isBalancete: !!a.is_balancete,
      });
      setClienteId(a.cliente_id || '');
      setAnos(Array.isArray(a.anos) ? a.anos.map(String) : []);
      setRows((a.rows || []).map((r) => rebuildEditableRow(r, a.anos)));
      setSavedId(a.id);
      setSourceInfo({ nome: 'análise salva', modo: 'histórico' });
      setStep(2);
    })().catch((e) => toast(e.message, 'error'));
  }, [analiseId, repo, toast]);

  // memória anterior = ÚLTIMO planilhamento do cliente no banco
  useEffect(() => {
    const c = clientes.find((x) => x.id === clienteId);
    if (c) setHeader((h) => ({ ...h, empresa: c.nome, cnpj: c.cnpj || '', grupo: c.grupo || '' }));
    if (!clienteId && !header.cnpj) { setMemory([]); return; }
    repo.getCompanyMemory(clienteId || null, header.cnpj || null)
      .then((m) => setMemory(m.filter(entradaValida))) // ignora destinos inválidos de análises antigas
      .catch(() => setMemory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, clientes]);

  /* ---------------- pipeline ---------------- */
  const result = useMemo(() => {
    if (!rows.length) return null;
    return runPipeline(rows, {
      dicionario: dicionario.length ? dicionario : undefined,
      companyMemory: memory,
      isBalancete: header.isBalancete,
    });
  }, [rows, dicionario, memory, header.isBalancete]);

  const resultById = useMemo(
    () => new Map((result?.rows || []).map((r) => [String(r.id), r])),
    [result],
  );

  const analysis = useMemo(() => computeAnalysis(result), [result]);

  /* ---------------- fatos da extração (p/ o chat de confirmação) ---------------- */
  const extracao = useMemo(() => {
    if (!rows.length) return null;
    const paginas = [...new Set(rows.map((r) => String(r.paginaReferencia || '').trim()).filter(Boolean))];
    const porGrupo = { Ativo: 0, Passivo: 0, DRE: 0, '': 0 };
    for (const r of result?.rows || []) porGrupo[r.grupo] = (porGrupo[r.grupo] || 0) + 1;
    // Lucro Líquido: linha explícita do documento (validação de leitura, Guia §5 item 7)
    const llRow = rows.find((r) => LL_RE.test(r.origem));
    return {
      paginas, porGrupo, llRow, semGrupo: porGrupo[''] || 0,
    };
  }, [rows, result]);

  /* ---------------- importação ---------------- */
  function ingestTable(table, nome, origem) {
    const det = autoDetect(table, anos);
    const built = det.mode === 'header'
      ? buildEntryRows(table, det.mapping, { headerRow: det.headerRow })
      : buildRowsPositional(table, { headerRow: det.headerRow, anos: det.anos });
    if (!built.rows.length) throw new Error('Não encontrei linhas de contas no conteúdo importado.');
    setRows(built.rows);
    setAnos(built.anos.map(String));
    const nCodigo = built.rows.filter((r) => r.codigo).length;
    setHeader((h) => ({ ...h, isBalancete: nCodigo / built.rows.length > 0.3 }));
    setSourceInfo({ nome, modo: origem, n: built.rows.length });
    setConfirm({ bp: 'A', dre: 'A', periodos: 'A', unidade: 'A', ll: 'A' });
    setPaginasMeta(null); // importação local não tem info de páginas
    setEditAnos(false);
    setPeriodSel('A');
    setPeriodChecks(built.anos.map(String));
    setVisoes([]);
    setVisaoSel('');
    julgTried.current = new Set();
    setStep(1);
  }

  /** Extração via API de IA (job assíncrono com progresso). Retorna true se ok. */
  async function extractViaIA(file) {
    try {
      setBusy('ia');
      setIaMsg('enviando o documento…');
      const out = await api.extract(file, setIaMsg);
          // CAPTURA COMPLETA vem com totalizadores. Dois tipos viram
          // CONTEXTO (Alocação=Não) para não dobrar valores:
          //  1. pais (origem que aparece como hierarquia de alguém);
          //  2. linhas de TOTAL/SUBTOTAL do documento (isTotal — "Total do
          //     ativo", "Lucro Bruto"…), que além de Não ganham noAuto:
          //     nenhuma camada automática pode alocá-las (era a causa nº 1
          //     do A ≠ P + PL: julgamental alocando "Total circulante").
          const pais = new Set((out.rows || [])
            .map((r) => String(r.hierarquia || '').trim().toLowerCase())
            .filter(Boolean));
          const ehTotal = (r) => r.isTotal === true
            || /^\s*(sub)?tota(l|is)\b/i.test(String(r.origem || ''));
          const mapped = (out.rows || []).map((r) => newRow({
            origem: r.origem || '', hierarquia: r.hierarquia || '', codigo: r.codigo || '',
            paginaReferencia: r.pagina != null ? String(r.pagina) : '',
            grupo: r.grupo || '', subCategoria: r.subCategoria || '',
            valores: r.valores || {},
            alocacaoHierarquia: (ehTotal(r) || pais.has(String(r.origem || '').trim().toLowerCase())) ? 'Não' : 'Sim',
            noAuto: ehTotal(r),
          }));
          if (!mapped.length) throw new Error('A IA não encontrou contas no documento.');
          setRows(mapped);
          const anosIA = (out.meta?.anos || []).map(String);
          setAnos(anosIA.slice(0, 8)); // todos os períodos: o usuário escolhe visão + quais planilhar
          setPeriodSel(anosIA.length > 3 ? 'B' : 'A');
          setPeriodChecks(anosIA.slice(0, 8));
          const vs = (out.meta?.visoes || []).map(String);
          setVisoes(vs);
          setVisaoSel(vs.length > 1 ? '' : (vs[0] || ''));
          julgTried.current = new Set();
          setHeader((h) => ({
            ...h,
            unidade: out.meta?.unidade || h.unidade,
            moeda: out.meta?.moeda || h.moeda,
            isBalancete: out.meta?.isBalancete ?? h.isBalancete,
          }));
          setSourceInfo({ nome: file.name, modo: 'ia', n: mapped.length, provider: out.provider });
          const falhas = out.meta?.paginas_com_falha || [];
          if (falhas.length) {
            toast(`Atenção: ${falhas.length} página(s) não puderam ser extraídas (${falhas.map((f) => String(f).split(':')[0]).join('; ')}). Reimporte em alguns minutos ou complete manualmente.`, 'error');
          }
          setConfirm({ bp: 'A', dre: 'A', periodos: 'A', unidade: 'A', ll: 'A' });
          const pgBp = (out.meta?.paginas_bp || []).map(String);
          const pgDre = (out.meta?.paginas_dre || []).map(String);
          setPaginasMeta(pgBp.length || pgDre.length ? { bp: pgBp, dre: pgDre } : null);
          setBpPagesText(pgBp.join(', '));
          setDrePagesText(pgDre.join(', '));
          setStep(1);
          return true;
    } catch (e) {
      toast(`Extração via IA falhou: ${e.message}`, 'error');
      return false;
    } finally { setBusy(''); setIaMsg(''); }
  }

  /** Importação local (xlsx/csv/PDF editável) — roda no navegador. */
  async function importLocal(file) {
    setBusy('lendo');
    try {
      const out = await readFile(file);
      if (out.kind === 'sheets') {
        let best = null;
        for (const s of out.sheets) {
          try {
            const det = autoDetect(s.rows, []);
            const b = det.mode === 'header'
              ? buildEntryRows(s.rows, det.mapping, { headerRow: det.headerRow })
              : buildRowsPositional(s.rows, { headerRow: det.headerRow, anos: det.anos });
            if (!best || b.rows.length > best.built.rows.length) best = { sheet: s, built: b };
          } catch { /* próxima aba */ }
        }
        if (!best || !best.built.rows.length) throw new Error('Nenhuma aba com contas reconhecíveis.');
        ingestTable(best.sheet.rows, `${file.name} · aba ${best.sheet.name}`, 'arquivo');
      } else {
        ingestTable(out.rows, file.name, 'arquivo');
      }
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    } finally { setBusy(''); }
  }

  async function handleFile(file) {
    const ext = (file.name.toLowerCase().match(/\.([a-z0-9]+)$/) || [, ''])[1];
    const visual = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext);

    // PDF/imagem: a API é o caminho PRINCIPAL (texto-first no servidor lê
    // qualquer PDF com fidelidade; o parser local é frágil p/ layouts
    // complexos). Só cai para o parser local se a API estiver indisponível.
    if (visual && isApiConfigured) {
      if (await extractViaIA(file)) return;
      if (ext !== 'pdf') return; // imagem sem IA não tem plano B
      toast('Tentando leitura local do PDF (modo offline)…', 'info');
    }
    await importLocal(file);
  }

  function handlePaste() {
    try {
      const table = parseDelimited(pasteText);
      ingestTable(table, 'conteúdo colado', 'colar');
      setPasteOpen(false); setPasteText('');
    } catch (e) { toast(e.message, 'error'); }
  }

  function startManual() {
    const y = String(new Date().getFullYear() - 1);
    setAnos([y]);
    setRows([newRow(), newRow(), newRow()]);
    setSourceInfo({ nome: 'entrada manual', modo: 'manual', n: 3 });
    setStep(1);
  }

  /* ---------------- confirmação -> alocação ---------------- */
  function confirmAndAllocate() {
    let next = rows;

    // Escopo de páginas aprovado (§12): quando o usuário corrige as páginas
    // de BP/DRE, contas de páginas FORA do escopo viram contexto (Não) —
    // capturadas, nunca descartadas (captura completa).
    if (paginasMeta) {
      const parse = (t) => String(t || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
      const escopo = new Set([
        ...(confirm.bp === 'B' ? parse(bpPagesText) : paginasMeta.bp),
        ...(confirm.dre === 'B' ? parse(drePagesText) : paginasMeta.dre),
      ].map(String));
      if (escopo.size) {
        next = next.map((r) => {
          const pags = parse(r.paginaReferencia);
          if (!pags.length) return r; // sem página conhecida: mantém
          return pags.some((p) => escopo.has(p)) ? r : { ...r, alocacaoHierarquia: 'Não' };
        });
      }
    }

    // Períodos escolhidos para planilhar (máx. 3 — limite do template),
    // dentro da VISÃO escolhida (Guia §5.1): colunas de outras visões e
    // períodos não selecionados são removidos dos valores.
    let chosen = ((visaoSel && visaoSel !== 'AMBAS')
      ? anos.filter((a) => normalizeText(a).includes(normalizeText(visaoSel)))
      : anos).map(String);
    if (periodSel === 'B') chosen = chosen.filter((a) => periodChecks.includes(a));
    if (!chosen.length) { toast('Selecione ao menos um período para planilhar.', 'error'); return; }
    if (chosen.length > 3) {
      chosen = chosen.slice(-3);
      toast('O template comporta até 3 períodos — mantive os 3 últimos.', 'ok');
    }
    if (chosen.length !== anos.length) {
      const keep = new Set(chosen);
      next = next.map((r) => {
        const valores = {};
        for (const [ano, v] of Object.entries(r.valores || {})) {
          if (keep.has(String(ano))) valores[ano] = v;
        }
        return { ...r, valores };
      });
      setAnos(chosen);
    }

    if (confirm.unidade === 'B' || confirm.unidade === 'C') {
      const mult = confirm.unidade === 'B' ? 1000 : 0.001;
      next = next.map((r) => {
        const valores = {};
        for (const [ano, v] of Object.entries(r.valores || {})) {
          const n = coerceNumber(v);
          valores[ano] = typeof n === 'number' ? n * mult : v;
        }
        return { ...r, valores };
      });
    }
    const res = runPipeline(next, {
      dicionario: dicionario.length ? dicionario : undefined,
      companyMemory: memory,
      isBalancete: header.isBalancete,
    });
    const byId = new Map(res.rows.map((r) => [String(r.id), r]));
    next = next.map((r) => {
      if (r.destino && r.destino.trim()) return r;
      const m = byId.get(String(r.id));
      if (m && m.destino) {
        return { ...r, destino: m.destino, grupo: m.grupo, subCategoria: m.subCategoria, tipoMapeamento: m.tipoMapeamento };
      }
      return r;
    });
    setRows(next);
    setStep(2);
    const nAuto = next.filter((r) => r.destino).length;
    toast(`${nAuto} de ${next.length} contas alocadas automaticamente (memória + dicionário).`, 'ok');
    // a 3ª camada (julgamental via IA) dispara sozinha ao entrar na Revisão —
    // ver o useEffect "julgamental automático" abaixo.
  }

  // JULGAMENTAL AUTOMÁTICO (auto-recuperável): sempre que houver conta com
  // Alocação=Sim sem destino na Revisão, o LLM é chamado sem clique — e se a
  // API estava fora do ar na 1ª tentativa, tenta de novo quando voltar.
  useEffect(() => {
    if (step !== 2 || !isApiConfigured || !apiStatus.online || busy === 'julgamental') return;
    const pendentes = rows.filter((r) => r.alocacaoHierarquia === 'Sim'
      && (!r.destino || !r.destino.trim())
      && !r.noAuto
      && String(r.origem || '').trim()
      && !julgTried.current.has(r.id));
    if (!pendentes.length) return;
    pendentes.forEach((r) => julgTried.current.add(r.id));
    setBusy('julgamental');
    applyJulgamental(pendentes)
      .then((n) => { if (n) toast(`Julgamental (IA): ${n} de ${pendentes.length} contas alocadas automaticamente — revise as marcadas em âmbar.`, 'ok'); })
      .catch((e) => {
        // libera para nova tentativa automática quando a API voltar
        pendentes.forEach((r) => julgTried.current.delete(r.id));
        toast(`Julgamental automático indisponível: ${e.message}`, 'error');
      })
      .finally(() => setBusy(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, rows, apiStatus.online]);

  /* ---------------- ações da revisão ---------------- */
  // definir um destino manualmente sempre limpa o flag de "retirada manual"
  const updateRow = (id, patch) => setRows((rs) => rs.map((r) => (
    r.id === id ? { ...r, ...patch, ...(patch.destino ? { noAuto: false } : {}) } : r
  )));
  const updateValor = (id, ano, v) => setRows((rs) => rs.map((r) => {
    if (r.id !== id) return r;
    const valores = { ...r.valores };
    if (v === '' || v == null) delete valores[ano]; else valores[ano] = v;
    return { ...r, valores };
  }));
  const deleteRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));

  function autoAllocate() {
    if (!result) return;
    let n = 0;
    setRows((rs) => rs.map((r) => {
      if (r.destino && r.destino.trim()) return r;
      const m = resultById.get(String(r.id));
      if (m && m.destino) {
        n += 1;
        return { ...r, destino: m.destino, grupo: m.grupo, subCategoria: m.subCategoria, tipoMapeamento: m.tipoMapeamento };
      }
      return r;
    }));
    setTimeout(() => toast(`${n} destino(s) preenchidos automaticamente.`, 'ok'), 0);
  }

  /**
   * Camada JULGAMENTAL via LLM: envia as contas pendentes em lote e aplica as
   * sugestões válidas (o servidor já descartou destino fora do plano/grupo).
   * Não sobrescreve destino que o usuário tenha definido enquanto a IA rodava.
   */
  async function applyJulgamental(pendentes) {
    const payload = pendentes.map((r) => ({
      id: r.id, origem: r.origem, hierarquia: r.hierarquia, codigo: r.codigo,
      grupo: r.grupo, subCategoria: r.subCategoria,
    }));
    const plano = CONTAS_ALOCAVEIS.map((c) => ({ destino: c.destino, grupo: c.grupo, subCategoria: c.subCategoria }));
    const out = await api.julgamental(payload, plano);
    const byId = new Map((out.suggestions || []).filter((s) => s.destino).map((s) => [String(s.id), s]));
    setRows((rs) => rs.map((r) => {
      const s = byId.get(String(r.id));
      if (!s) return r;
      if (r.destino && r.destino.trim()) return r; // edição do usuário vence
      return {
        ...r, destino: s.destino, grupo: s.grupo || r.grupo, subCategoria: s.subCategoria || r.subCategoria,
        tipoMapeamento: 'Julgamental', justificativa: s.justificativa || '',
      };
    }));
    return byId.size;
  }

  async function sugerirIA() {
    const pendentes = rows.filter((r) => !r.destino || !r.destino.trim());
    if (!pendentes.length) { toast('Não há contas sem destino.', 'ok'); return; }
    setBusy('julgamental');
    try {
      const n = await applyJulgamental(pendentes);
      toast(`IA sugeriu destino para ${n} conta(s) — revise as marcadas como "julgamental".`, 'ok');
    } catch (e) { toast(`Sugestão via IA falhou: ${e.message}`, 'error'); } finally { setBusy(''); }
  }

  /* ---------------- salvar / exportar ---------------- */
  async function salvar() {
    if (!result) return;
    setBusy('salvando');
    try {
      const bal = result.shadow.balance.ano3;
      const rec = {
        id: savedId || undefined,
        cliente_id: clienteId || null,
        empresa: header.empresa, cnpj: header.cnpj, grupo: header.grupo,
        unidade: header.unidade, moeda: header.moeda, is_balancete: header.isBalancete,
        anos: result.years, rows: result.rows,
        n_linhas: result.rows.length, balanco_fechado: !!bal.ok,
        status: bal.ok ? 'concluida' : 'em_revisao',
        qa: { issues: result.qa.issues, summary: result.qa.summary },
      };
      const saved = await repo.saveAnalise(rec);
      setSavedId(saved.id);
      toast('Análise salva. O dicionário aprendeu e este planilhamento virou a memória anterior do cliente.', 'ok');
    } catch (e) { toast(`Falha ao salvar: ${e.message}`, 'error'); } finally { setBusy(''); }
  }

  function exportar() {
    if (!result || !result.rows.length) { toast('Nada para exportar.', 'error'); return; }
    const nome = downloadWorkbook(result, { ...header, anos: result.years, modelo: '', auditado: '', consolidado: '' }, dicionario);
    toast(`Excel gerado: ${nome}`, 'ok');
  }

  async function gerarParecerIA() {
    if (!result) return;
    setBusy('parecer');
    try {
      const out = await api.parecer({
        empresa: header.empresa, anos: result.years,
        summary: result.qa.summary, issues: result.qa.issues.slice(0, 20),
        balance: result.shadow.balance,
        kpis: analysis.kpis.map((k) => ({ label: k.label, valores: k.perYear })),
      });
      setParecerIA(out.parecer || '');
    } catch (e) { toast(`Parecer via IA indisponível: ${e.message}`, 'error'); } finally { setBusy(''); }
  }

  /* ================================ RENDER ================================ */
  const bal3 = result?.shadow.balance.ano3;
  const balanceState = !result || (!Math.abs(bal3?.ativo || 0) && !Math.abs(bal3?.passivoPl || 0))
    ? 'empty' : (bal3.ok ? 'ok' : 'bad');
  const yearHeaders = result ? result.years : anos;

  const rastreioRows = useMemo(() => {
    // exibe na ordem do Plano de Contas (a mesma da Rastreabilidade final)
    const order = new Map((result?.rows || []).map((r, i) => [String(r.id), i]));
    let sorted = [...rows].sort(
      (a, b) => (order.get(String(a.id)) ?? 1e9) - (order.get(String(b.id)) ?? 1e9),
    );
    if (selectedDestino) {
      const n = normalizeText(selectedDestino);
      sorted = sorted.filter((r) => {
        const d = resultById.get(String(r.id))?.destino || r.destino;
        return normalizeText(d) === n;
      });
    }
    const q = normalizeText(rastreioQuery);
    if (q) {
      sorted = sorted.filter((r) => {
        const res = resultById.get(String(r.id));
        return normalizeText(r.origem).includes(q)
          || normalizeText(r.hierarquia).includes(q)
          || normalizeText(res?.destino || r.destino).includes(q);
      });
    }
    return sorted;
  }, [rows, selectedDestino, resultById, result, rastreioQuery]);

  const llValores = extracao?.llRow
    ? anos.map((a) => ({ ano: a, v: coerceNumber(extracao.llRow.valores?.[a]) })).filter((x) => typeof x.v === 'number')
    : [];

  // Períodos pertencentes à visão escolhida (Guia §5.1): com múltiplas
  // visões, só as colunas do escopo escolhido são ofertadas p/ planilhar.
  const anosDaVisao = (visaoSel && visaoSel !== 'AMBAS')
    ? anos.filter((a) => normalizeText(a).includes(normalizeText(visaoSel)))
    : anos;

  // Numeração dinâmica das perguntas de confirmação (protocolo do Guia §5:
  // só perguntar sobre o que foi realmente localizado no documento).
  const numQ = (() => {
    let n = 0; const q = {};
    if (visoes.length > 1) q.visao = ++n;
    if (paginasMeta?.bp?.length) q.bp = ++n;
    if (paginasMeta?.dre?.length) q.dre = ++n;
    q.periodos = ++n;
    q.unidade = ++n;
    q.fonte = ++n;
    if (llValores.length) q.ll = ++n;
    return q;
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Análises</div>
          <h1>{header.empresa || 'Nova análise'}</h1>
          <p className="sub">
            {sourceInfo ? `Fonte: ${sourceInfo.nome}` : 'Envie um balanço (BP/DRE) e siga o fluxo guiado até o Excel final.'}
            {memory.length > 0 && ` · memória anterior ativa (${memory.length} contas do último planilhamento)`}
          </p>
        </div>
        {result && (
          <span className={`balance-badge ${balanceState}`}>
            {balanceState === 'empty' && 'A = P + PL: —'}
            {balanceState === 'ok' && 'A = P + PL ✓'}
            {balanceState === 'bad' && `A ≠ P + PL · dif ${money(bal3.dif)}`}
          </span>
        )}
      </div>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <span className="step-sep">—</span>}
            <button
              className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              style={{ border: 0, cursor: i < step ? 'pointer' : 'default', background: i === step ? undefined : 'transparent' }}
              onClick={() => { if (i < step) setStep(i); }}
            >
              <span className="n">{i < step ? '✓' : i + 1}</span> {s}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* ============ ETAPA 1 — DOCUMENTO ============ */}
      {step === 0 && (
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3>Documento do balanço</h3></div>
            <div className="card-body">
              <div
                className="dropzone"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
                onDragLeave={(e) => e.currentTarget.classList.remove('over')}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              >
                {busy === 'lendo' || busy === 'ia' ? (
                  <>
                    <span className="spinner" />
                    <div className="big">{busy === 'ia' ? 'Extraindo com IA…' : 'Lendo documento…'}</div>
                    {busy === 'ia' && <div className="hint">{iaMsg || 'processando…'}</div>}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 34 }}>📎</div>
                    <div className="big">Arraste o balanço aqui ou clique para escolher</div>
                    <div className="hint">
                      .xlsx · .xlsm · .csv · PDF com texto — processados no seu navegador
                      {isApiConfigured && ' · PDF escaneado e imagens via IA de visão'}
                    </div>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" hidden accept=".xlsx,.xlsm,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

              <div className="row mt-16">
                <button className="btn" onClick={() => setPasteOpen((v) => !v)}>📋 Colar tabela do Excel/PDF</button>
                <button className="btn ghost" onClick={startManual}>Digitar manualmente</button>
              </div>
              {pasteOpen && (
                <div className="mt-16">
                  <textarea className="input" rows={8} placeholder="Cole aqui (Ctrl+V) a tabela copiada do Excel ou do leitor de PDF…" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
                  <div className="row mt-16">
                    <button className="btn primary" onClick={handlePaste} disabled={!pasteText.trim()}>Importar conteúdo</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Cliente</h3></div>
            <div className="card-body">
              <div className="field">
                <label>Vincular a um cliente da carteira</label>
                <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">— sem vínculo —</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <p className="muted mt-16" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                Ao vincular um cliente, o último planilhamento salvo dele vira a <b>memória anterior</b>:
                as contas que você já revisou são realocadas automaticamente com prioridade máxima.
              </p>
              {memory.length > 0 && (
                <p className="pill teal mt-16">✓ {memory.length} contas na memória deste cliente</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ ETAPA 2 — CONFIRMAÇÃO (chat) ============ */}
      {step === 1 && extracao && (
        <div className="chat" style={{ maxWidth: 820 }}>
          {/* Mensagem 1: o que a IA leu */}
          <div className="bubble ai">
            <div className="who"><span className="dot" /> Analista IA</div>
            <p>
              Concluí a leitura de <b>{sourceInfo?.nome}</b>
              {sourceInfo?.modo === 'ia' && ' com IA de visão'}. Este é o resumo do que encontrei:
            </p>
            <div className="facts">
              <div className="fact"><div className="k">Contas capturadas</div><div className="v">{rows.length}</div></div>
              <div className={`fact${anos.join(' · ').length > 24 ? ' wide' : ''}`}>
                <div className="k">Períodos ({anos.length})</div>
                <div className="v">{anos.length ? anos.join('  ·  ') : '—'}</div>
              </div>
              <div className="fact"><div className="k">Unidade · moeda</div><div className="v">{header.unidade} · {header.moeda}</div></div>
              <div className="fact"><div className="k">Tipo de fonte</div><div className="v">{header.isBalancete ? 'Balancete' : 'BP/DRE'}</div></div>
              {visoes.length > 1 && (
                <div className="fact"><div className="k">Visões</div><div className="v">{visoes.join(' · ')}</div></div>
              )}
              {extracao.paginas.length > 0 && (
                <div className="fact"><div className="k">Páginas</div><div className="v">{extracao.paginas.slice(0, 6).join(', ')}</div></div>
              )}
              <div className="fact">
                <div className="k">Composição</div>
                <div className="v" style={{ fontSize: 12.5 }}>
                  {extracao.porGrupo.Ativo || 0} Ativo · {extracao.porGrupo.Passivo || 0} Passivo · {extracao.porGrupo.DRE || 0} DRE
                  {extracao.semGrupo > 0 && ` · ${extracao.semGrupo} a classificar`}
                </div>
              </div>
            </div>
            {llValores.length > 0 && (
              <p style={{ marginTop: 10 }}>
                Para validar a leitura, localizei o <b>{extracao.llRow.origem}</b>:{' '}
                {llValores.map((x, i) => (
                  <span key={x.ano}>{i > 0 && ' · '}<b>{x.ano}: {money(x.v)}</b></span>
                ))}
              </p>
            )}
          </div>

          {/* Mensagem 2: perguntas de confirmação — protocolo do CustomGPT
              (Guia §5): UMA mensagem, perguntas numeradas no formato
              "Foi localizado que... está correto?", opções por LETRAS,
              perguntando apenas sobre o que foi realmente encontrado. */}
          <div className="bubble ai">
            <div className="who"><span className="dot" /> Analista IA · valide a leitura para eu iniciar a alocação</div>

            {numQ.visao && (
              <>
                <p style={{ fontWeight: 600 }}>
                  {numQ.visao}. O documento traz {visoes.length} visões: <b>{visoes.join(' e ')}</b>. Qual devo usar para consumir as informações financeiras?
                </p>
                <div className="choices">
                  {visoes.map((v, i) => (
                    <button
                      key={v}
                      className={`choice ${visaoSel === v ? 'selected' : ''}`}
                      onClick={() => {
                        setVisaoSel(v);
                        const nv = normalizeText(v);
                        const filtrados = anos.filter((a) => normalizeText(a).includes(nv));
                        setPeriodChecks(filtrados);
                        setPeriodSel(filtrados.length > 3 ? 'B' : 'A');
                      }}
                    >
                      <span className="letter">{String.fromCharCode(65 + i)}</span> {v}
                    </button>
                  ))}
                  <button
                    className={`choice ${visaoSel === 'AMBAS' ? 'selected' : ''}`}
                    onClick={() => { setVisaoSel('AMBAS'); setPeriodChecks(anos.map(String)); setPeriodSel('B'); }}
                  >
                    <span className="letter">{String.fromCharCode(65 + visoes.length)}</span> Ambas
                  </button>
                </div>
                {!visaoSel && <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>escolha uma visão para eu liberar a alocação</p>}
              </>
            )}

            {numQ.bp && (
              <>
                <p style={{ fontWeight: 600 }}>
                  {numQ.bp}. Foi localizado que o <b>BP (Balanço Patrimonial)</b> está na(s) página(s) <b>{paginasMeta.bp.join(' e ')}</b>. Está correto?
                </p>
                <div className="choices">
                  <button className={`choice ${confirm.bp === 'A' ? 'selected' : ''}`} onClick={() => setConfirm({ ...confirm, bp: 'A' })}>
                    <span className="letter">A</span> Sim
                  </button>
                  <button className={`choice ${confirm.bp === 'B' ? 'selected' : ''}`} onClick={() => setConfirm({ ...confirm, bp: 'B' })}>
                    <span className="letter">B</span> Não — informar as páginas corretas
                  </button>
                </div>
                {confirm.bp === 'B' && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <input className="input" style={{ maxWidth: 220 }} placeholder="ex.: 33, 34" value={bpPagesText} onChange={(e) => setBpPagesText(e.target.value)} />
                    <span className="muted" style={{ fontSize: 12 }}>contas fora do escopo viram contexto (não somam)</span>
                  </div>
                )}
              </>
            )}

            {numQ.dre && (
              <>
                <p className="mt-16" style={{ fontWeight: 600 }}>
                  {numQ.dre}. Foi localizado que a <b>DRE</b> está na(s) página(s) <b>{paginasMeta.dre.join(' e ')}</b>. Está correto?
                </p>
                <div className="choices">
                  <button className={`choice ${confirm.dre === 'A' ? 'selected' : ''}`} onClick={() => setConfirm({ ...confirm, dre: 'A' })}>
                    <span className="letter">A</span> Sim
                  </button>
                  <button className={`choice ${confirm.dre === 'B' ? 'selected' : ''}`} onClick={() => setConfirm({ ...confirm, dre: 'B' })}>
                    <span className="letter">B</span> Não — informar as páginas corretas
                  </button>
                </div>
                {confirm.dre === 'B' && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <input className="input" style={{ maxWidth: 220 }} placeholder="ex.: 36" value={drePagesText} onChange={(e) => setDrePagesText(e.target.value)} />
                  </div>
                )}
              </>
            )}

            {anosDaVisao.length > 1 ? (
              <>
                <p className="mt-16" style={{ fontWeight: 600 }}>
                  {numQ.periodos}. Estes foram os períodos analisados{visaoSel && visaoSel !== 'AMBAS' ? ` na visão ${visaoSel}` : ''}: <b>{anosDaVisao.join(' · ')}</b>. Quais você quer planilhar?
                </p>
                <div className="choices">
                  <button className={`choice ${periodSel === 'A' ? 'selected' : ''}`} onClick={() => { setPeriodSel('A'); setPeriodChecks(anosDaVisao.map(String)); }}>
                    <span className="letter">A</span> Todos{anosDaVisao.length > 3 ? ' (mantém os 3 últimos)' : ''}
                  </button>
                  <button className={`choice ${periodSel === 'B' ? 'selected' : ''}`} onClick={() => setPeriodSel('B')}>
                    <span className="letter">B</span> Escolher quais
                  </button>
                </div>
                {periodSel === 'B' && (
                  <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    {anosDaVisao.map((a) => {
                      const on = periodChecks.includes(String(a));
                      return (
                        <button
                          key={a}
                          className={`choice ${on ? 'selected' : ''}`}
                          onClick={() => setPeriodChecks(
                            on ? periodChecks.filter((x) => x !== String(a)) : [...periodChecks, String(a)],
                          )}
                        >
                          {on ? '✓ ' : ''}{a}
                        </button>
                      );
                    })}
                    <span className="muted" style={{ fontSize: 12 }}>até 3 períodos (limite do template)</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mt-16" style={{ fontWeight: 600 }}>
                  {numQ.periodos}. {anosDaVisao.length
                    ? <>Foi identificado o período <b>{anosDaVisao[0]}</b>. Está correto?</>
                    : <>Não consegui identificar os períodos do documento. Informe os anos:</>}
                </p>
                {anos.length > 0 && (
                  <div className="choices">
                    <button className={`choice ${confirm.periodos === 'A' && !editAnos ? 'selected' : ''}`} onClick={() => { setConfirm({ ...confirm, periodos: 'A' }); setEditAnos(false); }}>
                      <span className="letter">A</span> Sim
                    </button>
                    <button className={`choice ${editAnos ? 'selected' : ''}`} onClick={() => { setConfirm({ ...confirm, periodos: 'B' }); setEditAnos(true); }}>
                      <span className="letter">B</span> Não — ajustar
                    </button>
                  </div>
                )}
                {(editAnos || !anos.length) && (
                  <div className="row" style={{ marginTop: 10 }}>
                    {[0, 1, 2].map((i) => (
                      <input key={i} className="input" style={{ maxWidth: 100 }} placeholder={`Ano ${i + 1}`} value={anos[i] ?? ''}
                        onChange={(e) => {
                          const next = [...anos];
                          if (e.target.value) next[i] = e.target.value; else next.splice(i, 1);
                          setAnos(next.filter(Boolean));
                        }} />
                    ))}
                    <span className="muted" style={{ fontSize: 12 }}>o mais recente por último (vai para Ano 3)</span>
                  </div>
                )}
              </>
            )}

            <p className="mt-16" style={{ fontWeight: 600 }}>
              {numQ.unidade}. Identifiquei que a unidade de medida e a moeda estão em <b>{header.unidade} - {header.moeda}</b>. Está correto?
            </p>
            <div className="choices">
              {[['A', 'Unidade e moeda estão corretas'], ['B', 'Necessário multiplicar os valores por 1.000'], ['C', 'Necessário dividir os valores por 1.000'], ['D', 'Usar outra unidade/moeda']].map(([k, label]) => (
                <button key={k} className={`choice ${confirm.unidade === k ? 'selected' : ''}`} onClick={() => setConfirm({ ...confirm, unidade: k })}>
                  <span className="letter">{k}</span> {label}
                </button>
              ))}
            </div>
            {confirm.unidade === 'D' && (
              <div className="row" style={{ marginTop: 10 }}>
                <select className="input" style={{ maxWidth: 120 }} value={header.unidade} onChange={(e) => setHeader({ ...header, unidade: e.target.value })}>
                  <option>Unitário</option><option>Mil</option><option>MM</option><option>BI</option>
                </select>
                <select className="input" style={{ maxWidth: 110 }} value={header.moeda} onChange={(e) => setHeader({ ...header, moeda: e.target.value })}>
                  <option>BRL</option><option>USD</option><option>EUR</option>
                </select>
              </div>
            )}

            <p className="mt-16" style={{ fontWeight: 600 }}>
              {numQ.fonte}. Foi identificado que a fonte é <b>{header.isBalancete ? 'um balancete bruto (saldos débito/crédito)' : 'BP/DRE já estruturado (valores de apresentação)'}</b>. Está correto?
            </p>
            <div className="choices">
              <button className={`choice ${header.isBalancete ? 'selected' : ''}`} onClick={() => setHeader({ ...header, isBalancete: true })}>
                <span className="letter">A</span> É balancete — converter o sinal contábil
              </button>
              <button className={`choice ${!header.isBalancete ? 'selected' : ''}`} onClick={() => setHeader({ ...header, isBalancete: false })}>
                <span className="letter">B</span> É BP/DRE estruturado
              </button>
            </div>

            {llValores.length > 0 && (
              <>
                <p className="mt-16" style={{ fontWeight: 600 }}>
                  {numQ.ll}. Foi localizado o <b>{extracao.llRow.origem}</b> de {llValores.map((x) => `${money(x.v)} em ${x.ano}`).join(' e ')}. Confere com o documento?
                </p>
                <div className="choices">
                  <button className={`choice ${confirm.ll === 'A' ? 'selected' : ''}`} onClick={() => setConfirm({ ...confirm, ll: 'A' })}>
                    <span className="letter">A</span> Sim, confere
                  </button>
                  <button className={`choice ${confirm.ll === 'B' ? 'selected' : ''}`} onClick={() => setConfirm({ ...confirm, ll: 'B' })}>
                    <span className="letter">B</span> Não confere — vou revisar os valores
                  </button>
                </div>
                {confirm.ll === 'B' && (
                  <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
                    Ok — confira os valores da DRE na etapa de Revisão antes de entregar.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setStep(0)}>← Voltar</button>
            <button
              className="btn primary"
              onClick={confirmAndAllocate}
              disabled={!anos.length || (visoes.length > 1 && !visaoSel)}
              title={visoes.length > 1 && !visaoSel ? 'Escolha a visão (pergunta 1) para continuar' : ''}
            >
              Confirmar e iniciar alocação →
            </button>
          </div>
        </div>
      )}

      {/* ============ ETAPA 3 — REVISÃO (layout Shadow) ============ */}
      {step === 2 && result && (
        <>
          {/* Análise e Drivers ACIMA da Shadow (largura total, sem coluna
              lateral — evita aperto e scroll horizontal da página) */}
          <div className="analysis-row">
              <div className="card">
                <div className="card-head">
                  <h3>Análise do cliente</h3>
                  <span className="pill gray" title="Os KPIs são recalculados a partir da Shadow a cada ajuste manual (adicionar/retirar/realocar)">● ao vivo</span>
                </div>
                <div className="card-body">
                  {!analysis.hasData && <p className="muted" style={{ fontSize: 12.5 }}>Aloque as contas para os KPIs aparecerem.</p>}
                  {analysis.kpis.map((k) => {
                    const last = k.perYear[k.perYear.length - 1];
                    const prev = k.perYear.length > 1 ? k.perYear[k.perYear.length - 2] : null;
                    return (
                      <div key={k.label} className="kpi-row">
                        <span className="lbl">{k.label}</span>
                        <span className="vals">
                          {prev && <span className="v prev">{fmtKpi(prev.value, k.unit)}</span>}
                          <span className="v">{fmtKpi(last?.value, k.unit)}</span>
                          {k.trigger && <span className={`trend ${k.trigger}`}>{k.trigger === 'up' ? '▲' : '▼'}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>Drivers de atenção</h3>
                  <span
                    className={`pill ${analysis.drivers.some((d) => d.kind === 'down' || d.kind === 'warn') ? 'amber' : 'green'}`}
                    title="Recalculados a cada ajuste: um driver corrigido sai da lista automaticamente"
                  >
                    {analysis.drivers.length || 'nenhum'} · ao vivo
                  </span>
                </div>
                <div className="card-body">
                  {!analysis.drivers.length && <p className="muted" style={{ fontSize: 12.5 }}>Nenhum driver de atenção identificado.</p>}
                  {analysis.drivers.map((d, i) => (
                    <div key={i} className={`driver ${d.kind}`}>
                      <span className="ic">{d.kind === 'up' ? '▲' : (d.kind === 'down' ? '▼' : '!')}</span>
                      <span>
                        {d.text}
                        {d.action?.type === 'transporteResultado' && (
                          <button
                            className="btn sm"
                            style={{ display: 'block', marginTop: 8 }}
                            onClick={() => {
                              setRows((rs) => [...rs, newRow({
                                origem: 'Resultado do Exercício (transporte)',
                                grupo: 'Passivo', subCategoria: 'PL',
                                destino: 'Lucros Acumulados',
                                tipoMapeamento: 'Julgamental',
                                alocacaoHierarquia: 'Sim',
                                valores: d.action.valores,
                              })]);
                              toast('Resultado transportado para Lucros Acumulados (lucro soma, prejuízo reduz) — confira o fechamento.', 'ok');
                            }}
                          >
                            ⚡ {d.action.label}
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  <details className="tech">
                    <summary>Apontamentos técnicos do QA ({result.qa.issues.length})</summary>
                    <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
                      {result.qa.issues.map((i, k) => (
                        <p key={k} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                          <span className={`pill ${i.level === 'error' ? 'red' : 'amber'}`} style={{ marginRight: 6 }}>{i.level === 'error' ? 'erro' : 'aviso'}</span>
                          {i.msg}
                        </p>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn ghost" onClick={() => setStep(1)}>← Confirmação</button>
            <button
              className="btn primary"
              onClick={() => {
                if (balanceState === 'bad' && !window.confirm('O balanço não fecha (A ≠ P + PL). O especialista recomenda corrigir antes de entregar. Continuar mesmo assim?')) return;
                setStep(3);
              }}
            >
              Concluir revisão →
            </button>
          </div>

          <ShadowView
            result={result}
            memory={memory}
            allRows={rows}
            resultById={resultById}
            onRemoveOrigem={(id) => {
              updateRow(id, {
                destino: '', tipoMapeamento: '', justificativa: '', noAuto: true,
              });
              toast('Conta retirada da linha — ficou "sem destino" para você realocar.', 'ok');
            }}
            onAddOrigem={(id, line) => {
              updateRow(id, {
                destino: line.destino, grupo: line.grupo, subCategoria: line.subCategoria, tipoMapeamento: 'Julgamental',
              });
              toast(`Conta adicionada em "${line.destino}".`, 'ok');
            }}
            onVerRastreio={(d) => { setSelectedDestino(d); setShowRastreio(true); }}
          />

          {/* Rastreabilidade — ajustes no micro */}
          <div className="card mt-24">
            <div className="card-head" style={{ paddingBottom: showRastreio ? 0 : 18, cursor: 'pointer' }} onClick={() => setShowRastreio((v) => !v)}>
              <h3>
                {showRastreio ? '▾' : '▸'} Rastreabilidade — ajustes no micro · {rastreioRows.length}
                {selectedDestino ? ` conta(s) em "${selectedDestino}"` : ` conta(s)`}
              </h3>
              <div className="row" onClick={(e) => e.stopPropagation()}>
                <input
                  className="input"
                  style={{ maxWidth: 220, padding: '6px 11px', fontSize: 12.5 }}
                  placeholder="🔎 Filtrar (ex.: Caixa)…"
                  value={rastreioQuery}
                  onChange={(e) => { setRastreioQuery(e.target.value); if (e.target.value) setShowRastreio(true); }}
                />
                {(selectedDestino || rastreioQuery) && (
                  <button className="btn sm ghost" onClick={() => { setSelectedDestino(null); setRastreioQuery(''); }}>✕ limpar</button>
                )}
                <button className="btn sm" onClick={autoAllocate}>⚡ Auto-alocar</button>
                <button className="btn sm" onClick={sugerirIA} disabled={busy === 'julgamental' || !isApiConfigured || !apiStatus.online}
                  title={!isApiConfigured ? 'Configure VITE_API_URL para habilitar' : ''}>
                  {busy === 'julgamental' ? <span className="spinner" /> : '✨ Sugerir com IA'}
                </button>
              </div>
            </div>
            {showRastreio && (
              <div className="card-body">
                <RastreabilidadeGrid
                  rows={rastreioRows}
                  anos={yearHeaders}
                  resultById={resultById}
                  onUpdate={updateRow}
                  onUpdateValor={updateValor}
                  onDelete={deleteRow}
                  onAdd={() => setRows((rs) => [...rs, newRow()])}
                />
              </div>
            )}
          </div>
        </>
      )}
      {step === 2 && !result && (
        <div className="empty card"><div className="card-body">Nenhuma conta carregada. <button className="btn sm" onClick={() => setStep(0)}>Voltar ao início</button></div></div>
      )}

      {/* ============ ETAPA 4 — RESULTADO ============ */}
      {step === 3 && result && (
        <div className="grid-2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="stat-grid" style={{ marginBottom: 0 }}>
              <div className="stat"><div className="k">Contas capturadas</div><div className="v">{result.qa.summary.quantidadeLinhas}</div></div>
              <div className="stat"><div className="k">Alocadas (Sim)</div><div className="v">{result.qa.summary.quantidadeAlocadas}</div><div className="d">{result.qa.summary.quantidadeContexto} de contexto</div></div>
              <div className={`stat ${balanceState === 'ok' ? 'ok' : 'bad'}`}>
                <div className="k">Balanço</div>
                <div className="v">{balanceState === 'ok' ? '✓' : '✗'}</div>
                <div className="d">{balanceState === 'ok' ? 'A = P + PL fechado' : `diferença ${money(bal3?.dif)}`}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Composição do mapeamento</h3></div>
              <div className="card-body">
                <div className="row">
                  {Object.entries(result.qa.summary.tiposMapeamento || {}).map(([t, n]) => (
                    <span key={t} className={`pill ${t === 'Memoria Anterior' ? 'teal' : (t === 'Dicionário' ? 'blue' : 'amber')}`}>{t}: {n}</span>
                  ))}
                </div>
                <p className="muted mt-16" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  Ao salvar, cada alocação confirmada vira regra do dicionário e este planilhamento
                  passa a ser a <b>memória anterior</b> do cliente.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Parecer do analista IA</h3>
                <button className="btn sm" onClick={gerarParecerIA} disabled={busy === 'parecer' || !isApiConfigured || !apiStatus.online}>
                  {busy === 'parecer' ? <span className="spinner" /> : '✨ Gerar parecer'}
                </button>
              </div>
              <div className="card-body">
                {parecerIA
                  ? <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 13.5 }}>{parecerIA}</p>
                  : <p className="muted">Gere um parecer executivo em linguagem natural sobre este planilhamento (via API de IA).</p>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Entrega</h3></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="btn primary" style={{ justifyContent: 'center', padding: 12 }} onClick={salvar} disabled={busy === 'salvando'}>
                {busy === 'salvando' ? <span className="spinner" /> : '💾 Salvar análise (ensina o dicionário)'}
              </button>
              <button className="btn" style={{ justifyContent: 'center', padding: 12 }} onClick={exportar}>
                ⬇ Exportar Excel (.xlsx)
              </button>
              <button className="btn ghost" style={{ justifyContent: 'center' }} onClick={() => setStep(2)}>← Voltar à revisão</button>
              <button className="btn ghost" style={{ justifyContent: 'center' }} onClick={() => navigate('/')}>Ir para a visão geral</button>
              {savedId && <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>salva como #{String(savedId).slice(0, 8)}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

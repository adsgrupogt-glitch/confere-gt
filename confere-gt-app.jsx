import React, { useState, useMemo, useEffect, useRef } from 'react';
import { login as fbLogin, trocarSenha as fbTrocarSenha, garantirUsuariosSeed } from './auth';
import { extrairTextoLayout, extrairTextoSequencial } from './extrator-pdf';
import { parseFolha } from './parser-folha';
import { parseHorasExtras } from './parser-horas-extras';
import { tier1Legal } from './regras-tier1';
import { tier1cCct } from './regras-tier1c';
import { tier1dVigia } from './regras-tier1d';
import { tier1ePisoRegional } from './regras-tier1e';
import { tier2ConsistenciaPares } from './regras-tier2';
import { tier5HorasExtras } from './regras-tier5';
import { tier6Dobras } from './regras-tier6';
import { tier7FeriasVencidas } from './regras-tier7';
import { parseRecibosFerias } from './parser-ferias';
import { gerarAchados } from './achados';
import { calcularAnalytics } from './analytics';
import { parseRelatorioChefia } from './parser-chefia';
import { cruzarChefias } from './analytics-chefia';
import { gerarAlertas } from './insights';
import { salvarResumoCompetencia, salvarExcecoes, salvarTiers, salvarAnalytics, salvarColaboradoresResumo, salvarEstruturaOrganizacional, lerEstruturaOrganizacional, registrarAtividade, listarCompetencias, lerCompetencia, listarAtividade, fecharCompetencia, excluirCompetencia, atualizarStatusExcecao } from './dados';
import { getVetorhApiUrl, setVetorhApiUrl, getVetorhApiKey, setVetorhApiKey, listarEmpresasVetorh, listarCompetenciasVetorh, buscarFolhaVetorh, historicoRubricaPorCentroCustoVetorh, historicoColaboradorVetorh } from './vetorh-api';
import { detectarMudancasRubrica, detectarMudancasColaborador } from './analise-historica';
import { rodarEConfirmarConferencia } from './motor-conferencia';

// As 5 empresas do Grupo GT (espelha o backend — usado só pros rótulos e
// pro seletor; a filtragem de verdade acontece no backend/banco).
const EMPRESAS = [
  { numEmp: 30, nome: 'RG Serviços', ativa: true },
  { numEmp: 40, nome: 'GT Vig', ativa: true },
  { numEmp: 50, nome: 'GT Cred', ativa: true },
  { numEmp: 10, nome: 'GT Servi', ativa: false },
  { numEmp: 20, nome: 'GT Limp', ativa: false },
];
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/* ============================================================
   CONFERE GT — Grupo GT
   Tema claro, mesma linguagem visual do Proposta GT / Cred GT.
   Paleta extraída da logo oficial (pixel-sampled):
     azul-profundo #0081B4 · azul-vivo #0095D3 · turquesa #00C4CB
     menta #C3E5D2 · cinza-wordmark #96989B
   Fundo claro (#F5F8FA), superfícies brancas, texto navy escuro.
   Login: usuário + senha numérica de 6 dígitos, com troca
   obrigatória no primeiro acesso — mesmo fluxo dos demais
   sistemas do Grupo GT. 3 admins nativos: Gabriel, Juliana, Shay.
   Tipografia: "Sora" (display) + "Inter" (corpo) + "IBM Plex Mono" (dados).
   Assinatura visual: hexágono da própria logo.
   Logo real em /logo-gt.png (já publicada no repositório).
   ============================================================ */

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap';

const BRAND = { deep: '#0081B4', blue: '#0095D3', teal: '#00C4CB', mint: '#C3E5D2', gray: '#7C8794' };

const TIER_META = {
  t1: { label: 'INSS / FGTS / VT', desc: 'Regra federal — tabela progressiva 2026, FGTS 8%, teto VT 6%' },
  t1c: { label: 'Periculosidade & Insalubridade', desc: 'CCT Asseio — 30% / 20% / 40% sobre o salário base' },
  t1d: { label: 'CCT Vigia', desc: 'Piso R$2.020,33 + proibição de periculosidade' },
  t1e: { label: 'Piso Regional', desc: 'São José · Florianópolis · Itajaí' },
  t2: { label: 'Consistência de Pares', desc: 'Desvio estatístico dentro do mesmo cargo' },
  t5: { label: 'Horas Extras', desc: 'Cruzamento ponto × folha, exclui banco de horas confirmado' },
  t6: { label: 'Dobras 12x36', desc: 'Limite de 5 dobras/mês — Cláusula 35ª §7º' },
  t7: { label: 'Férias Vencidas', desc: 'Concessão fora do prazo legal (Art. 134/137 CLT) — risco de pagamento em dobro' },
};


const ATIVIDADE = [
  { quando: '02/07 · 20:41', texto: 'RH confirmou: evento 2635 deve somar de volta à base de INSS/FGTS — taxa de acerto subiu de 40% para 90,5%', tipo: 'resolvido' },
  { quando: '02/07 · 18:22', texto: 'CCT Florianópolis registrada oficialmente no Mediador — SC000124/2026', tipo: 'info' },
  { quando: '02/07 · 15:10', texto: 'Piso de Itajaí confirmado menor que São José/Floripa — regra regional criada', tipo: 'info' },
  { quando: '02/07 · 14:05', texto: 'Achado crítico: Leandro Vinicius com 15 dobras no mês (limite CCT: 5) e zero pago', tipo: 'alerta' },
  { quando: '01/07 · 09:30', texto: 'Folha 06/2026 recalculada recebida — reprocessamento completo em andamento', tipo: 'info' },
];

const fmtBRL = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v) => v.toLocaleString('pt-BR');
const fmtPct = (v) => `${v.toFixed(1)}%`;

// Converte "06/2026" em chave ordenável (2026-06) pra ordenar cronologicamente.
const chaveOrdenavel = (comp) => {
  const [m, a] = comp.split('/');
  return `${a}-${m.padStart(2, '0')}`;
};

// Carrega todas as competências já processadas no Firebase (resumo, tiers,
// analytics) e devolve em ordem cronológica. É a fonte de dado real por trás
// do Dashboard e do Histórico & KPIs — nada aqui é mock.
function useTodasCompetencias(numEmp) {
  const [estado, setEstado] = useState({ loading: true, erro: null, meses: [] });

  const carregar = () => {
    if (!numEmp) return;
    setEstado((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const competencias = await listarCompetencias(numEmp);
        const ordenadas = [...competencias].sort((a, b) => chaveOrdenavel(a).localeCompare(chaveOrdenavel(b)));
        const dados = await Promise.all(ordenadas.map(async (comp) => {
          const d = await lerCompetencia(numEmp, comp);
          return { competencia: comp, ...d };
        }));
        setEstado({ loading: false, erro: null, meses: dados });
      } catch (e) {
        setEstado({ loading: false, erro: e.message || 'Falha ao carregar dados do Firebase.', meses: [] });
      }
    })();
  };

  useEffect(carregar, [numEmp]);

  return { ...estado, recarregar: carregar };
}

// O coração da mudança "sem upload manual": sempre que a empresa muda (ou o
// Dashboard abre), confere sozinho se a competência mais recente do Vetorh
// já está sincronizada. Se não estiver — ou se já se passou um tempo desde
// a última sincronização do mês corrente (que ainda pode estar mudando) —
// busca, roda o motor de regras e salva, tudo sem o usuário clicar em nada.
// Competência FECHADA nunca sincroniza sozinha de novo — fechar é decisão
// humana deliberada, e é isso que preserva a trilha de auditoria (mesmo
// padrão usado por Workday/ADP: dado fonte sempre vivo, trilha persistida).
function useSincronizacaoAutomatica(numEmp, meses, recarregarMeses) {
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSinc, setErroSinc] = useState(null);
  const jaTentou = useRef(new Set());

  useEffect(() => {
    if (!numEmp || !meses) return;
    let cancelado = false;
    (async () => {
      try {
        const competenciasVetorh = await listarCompetenciasVetorh(numEmp);
        if (!competenciasVetorh || competenciasVetorh.length === 0) return;
        const maisRecente = competenciasVetorh[0];
        const chaveTentativa = `${numEmp}-${maisRecente}`;
        if (jaTentou.current.has(chaveTentativa)) return;

        const cache = meses.find((m) => m.competencia === maisRecente);
        if (cache?.resumo?.status === 'fechada') return;
        if (cache?.resumo?.sincronizadoEm) {
          const minutos = (Date.now() - new Date(cache.resumo.sincronizadoEm)) / 60000;
          if (minutos < 30) return; // sincronizado há pouco, não martela o backend
        }

        jaTentou.current.add(chaveTentativa);
        setSincronizando(true); setErroSinc(null);
        const colaboradores = await buscarFolhaVetorh(numEmp, maisRecente);
        if (cancelado) return;
        if (colaboradores?.length > 0) {
          await rodarEConfirmarConferencia(numEmp, maisRecente, colaboradores, {
            fonte: 'vetorh', origemLabel: 'Sincronização automática com o Vetorh —', nomeUsuario: 'sistema',
          });
          if (!cancelado) recarregarMeses();
        }
      } catch (e) {
        if (!cancelado) setErroSinc(e.message || 'Falha ao sincronizar com o Vetorh.');
      } finally {
        if (!cancelado) setSincronizando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [numEmp, meses === null]);

  return { sincronizando, erroSinc };
}

function Hex({ size = 40, fill = BRAND.blue, stroke, strokeWidth = 0, style }) {
  return (
    <svg width={size} height={size * 0.86} viewBox="0 0 100 100" style={style}>
      <polygon points="25,0 75,0 100,50 75,100 25,100 0,50" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </svg>
  );
}

function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <polygon points="50,2 93,26 50,50" fill={BRAND.deep} />
      <polygon points="93,26 93,74 50,50" fill={BRAND.teal} />
      <polygon points="93,74 50,98 50,50" fill={BRAND.blue} />
      <polygon points="50,98 7,74 50,50" fill={BRAND.teal} opacity="0.85" />
      <polygon points="7,74 7,26 50,50" fill={BRAND.teal} />
      <polygon points="7,26 50,2 50,50" fill={BRAND.blue} />
      <polygon points="50,26 71,38 71,62 50,74 29,62 29,38" fill={BRAND.mint} />
    </svg>
  );
}

/* ---------------- LOGIN — mesmo fluxo do Proposta GT / Cred GT ----------------
   usuário + senha numérica de 6 dígitos; senha padrão 123456 no 1º acesso,
   com troca obrigatória antes de liberar o sistema. */
function LoginScreen({ onLogin }) {
  const [etapa, setEtapa] = useState('login'); // login | trocar_senha
  const [loginAtivo, setLoginAtivo] = useState(null);
  const [usuarioInput, setUsuarioInput] = useState('');
  const [senha, setSenha] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { garantirUsuariosSeed().catch(() => {}); }, []);

  const entrar = async () => {
    setErro(''); setCarregando(true);
    const r = await fbLogin(usuarioInput, senha).catch(() => ({ ok: false, erro: 'Sem conexão com o servidor. Tenta de novo.' }));
    setCarregando(false);
    if (!r.ok) { setErro(r.erro); return; }
    if (r.precisaTrocarSenha) { setLoginAtivo(r.login); setEtapa('trocar_senha'); }
    else onLogin(r.usuario);
  };

  const salvarNovaSenha = async () => {
    if (novaSenha !== confirmaSenha) { setErro('As senhas não coincidem.'); return; }
    setErro(''); setCarregando(true);
    const r = await fbTrocarSenha(loginAtivo, novaSenha).catch(() => ({ ok: false, erro: 'Sem conexão com o servidor. Tenta de novo.' }));
    setCarregando(false);
    if (!r.ok) { setErro(r.erro); return; }
    onLogin(r.usuario);
  };

  return (
    <div style={s.loginWrap}>
      <div style={s.loginCard}>
        <LogoMark size={52} />
        <div style={s.loginEyebrow}>GRUPO GT · ASSEIO · CONSERVAÇÃO · SEGURANÇA</div>
        <h1 style={s.loginTitle}>Confere GT</h1>
        <p style={s.loginSub}>Conferência de folha de pagamento — linha a linha, rubrica a rubrica, mês a mês.</p>

        {etapa === 'login' ? (
          <>
            <label style={s.label}>Usuário</label>
            <input style={s.inputText} value={usuarioInput} autoFocus
              onChange={(e) => setUsuarioInput(e.target.value)}
              placeholder="gabriel, juliana ou shay" />
            <label style={{ ...s.label, marginTop: 14 }}>Senha</label>
            <input style={s.input} type="password" maxLength={6} value={senha}
              onChange={(e) => setSenha(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && entrar()} placeholder="••••••" />
            {erro && <div style={s.errorText}>{erro}</div>}
            <button style={s.btnPrimary} onClick={entrar} disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button>
            <div style={s.loginHint}>Primeiro acesso? Use a senha padrão <b>123456</b> — o sistema vai pedir para você trocar.</div>
          </>
        ) : (
          <>
            <div style={s.firstAccessBadge}>Primeiro acesso — defina sua senha</div>
            <label style={{ ...s.label, marginTop: 10 }}>Nova senha (6 números)</label>
            <input style={s.input} type="password" maxLength={6} value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value.replace(/\D/g, ''))} placeholder="••••••" autoFocus />
            <label style={{ ...s.label, marginTop: 14 }}>Confirmar nova senha</label>
            <input style={s.input} type="password" maxLength={6} value={confirmaSenha}
              onChange={(e) => setConfirmaSenha(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && salvarNovaSenha()} placeholder="••••••" />
            {erro && <div style={s.errorText}>{erro}</div>}
            <button style={s.btnPrimary} onClick={salvarNovaSenha}>Salvar e entrar</button>
          </>
        )}
        <div style={s.loginFoot}>Acesso restrito · RG Serviços Especializados</div>
      </div>
    </div>
  );
}

function Sidebar({ user, tela, setTela, onLogout }) {
  const itens = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'upload', label: 'Sincronização Manual' },
    { id: 'excecoes', label: 'Exceções' },
    { id: 'chefias', label: 'Chefias & Estrutura' },
    { id: 'analiseHistorica', label: 'Análise Histórica' },
    { id: 'historico', label: 'Histórico & KPIs' },
    { id: 'assistente', label: 'Assistente IA', badge: 'em breve' },
    { id: 'usuarios', label: 'Usuários' },
  ];
  return (
    <div style={s.sidebar}>
      <div style={s.sidebarBrand}>
        <LogoMark size={30} />
        <div>
          <div style={s.sidebarBrandTitle}>Confere GT</div>
          <div style={s.sidebarBrandSub}>GRUPO GT</div>
        </div>
      </div>
      <nav style={{ marginTop: 26, flex: 1 }}>
        {itens.map((it) => (
          <button key={it.id} onClick={() => setTela(it.id)} style={{ ...s.navItem, ...(tela === it.id ? s.navItemActive : {}) }}>
            <span>{it.label}</span>
            {it.badge && <span style={s.navBadge}>{it.badge}</span>}
          </button>
        ))}
      </nav>
      <div style={s.sidebarUser}>
        <div style={s.avatar}>{user[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user}</div>
          <div style={{ fontSize: 11, color: BRAND.gray }}>Administrador</div>
        </div>
        <button onClick={onLogout} style={s.linkBtn} title="Sair">⏻</button>
      </div>
    </div>
  );
}

function HexKpi({ label, value, sub, tone }) {
  const color = tone === 'danger' ? '#D64545' : tone === 'good' ? BRAND.deep : BRAND.blue;
  return (
    <div style={s.hexKpi}>
      <div style={s.hexKpiGlyph}><Hex size={54} fill="none" stroke={color} strokeWidth={3} /></div>
      <div style={s.hexKpiLabel}>{label}</div>
      <div style={{ ...s.hexKpiValue, color }}>{value}</div>
      {sub && <div style={s.hexKpiSub}>{sub}</div>}
    </div>
  );
}

function SeverityPanel({ tiers, alta }) {
  const max = Math.max(...Object.values(tiers), 1);
  return (
    <div style={s.severityWrap}>
      {Object.entries(tiers).map(([k, total]) => (
        <div key={k} style={s.severityRow}>
          <div>
            <div style={s.severityLabel}>{TIER_META[k].label}</div>
            <div style={s.severitySub}>{TIER_META[k].desc}</div>
          </div>
          <div style={s.severityTrack}>
            <div style={{ ...s.severityFillTotal, width: `${(total / max) * 100}%` }} />
            {alta[k] > 0 && <div style={{ ...s.severityFillAlta, width: `${(alta[k] / max) * 100}%` }} />}
          </div>
          <div style={s.severityCount}>
            <span style={{ color: alta[k] > 0 ? '#D64545' : BRAND.gray, fontWeight: 700 }}>{alta[k]}</span>
            <span style={{ color: '#A9B3BE' }}> / {total}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed() {
  const dot = { resolvido: BRAND.teal, alerta: '#D64545', info: BRAND.blue };
  const [itens, setItens] = useState(null);

  useEffect(() => {
    let cancelado = false;
    listarAtividade(12).then((lista) => { if (!cancelado) setItens(lista); }).catch(() => { if (!cancelado) setItens([]); });
    return () => { cancelado = true; };
  }, []);

  const fmtQuando = (iso) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div style={s.panel}>
      <div style={s.panelTitle}>Linha do tempo da auditoria</div>
      <div>
        {itens === null && <div style={{ fontSize: 12.5, color: BRAND.gray }}>Carregando...</div>}
        {itens !== null && itens.length === 0 && <div style={{ fontSize: 12.5, color: BRAND.gray }}>Nenhuma atividade registrada ainda.</div>}
        {(itens || []).map((a, i) => (
          <div key={i} style={s.activityRow}>
            <div style={{ ...s.activityDot, background: dot[a.tipo] || BRAND.blue }} />
            <div style={{ flex: 1 }}>
              <div style={s.activityText}>{a.texto}</div>
              <div style={s.activityWhen}>{fmtQuando(a.quando)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ competencia, setCompetencia, numEmp }) {
  const { loading, erro, meses, recarregar } = useTodasCompetencias(numEmp);
  const { dados: estrutura } = useEstruturaOrganizacional(numEmp);
  const { sincronizando, erroSinc } = useSincronizacaoAutomatica(numEmp, loading ? null : meses, recarregar);

  if (loading) {
    return (
      <div>
        <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Painel de Conferência</div><h1 style={s.pageTitle}>Carregando...</h1></div></div>
      </div>
    );
  }
  if (erro) {
    return (
      <div>
        <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Painel de Conferência</div><h1 style={s.pageTitle}>Não consegui carregar</h1></div></div>
        <div style={s.panel}>{erro}</div>
      </div>
    );
  }
  if (meses.length === 0) {
    return (
      <div>
        <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Painel de Conferência</div><h1 style={s.pageTitle}>{sincronizando ? 'Sincronizando com o Vetorh...' : 'Nenhuma conferência ainda'}</h1></div></div>
        <div style={s.panel}>
          {sincronizando
            ? 'Buscando a folha mais recente direto do banco — isso leva só alguns segundos, sem precisar subir nada.'
            : erroSinc
              ? <>Não consegui sincronizar automaticamente: {erroSinc}. Confirma se o backend está rodando, ou usa "Nova Conferência" pra subir um PDF manualmente.</>
              : 'Ainda não há dado sincronizado pra essa empresa. Se ela tiver movimento no Vetorh, a sincronização automática deve trazer os dados em instantes.'}
        </div>
      </div>
    );
  }

  const mesesComp = meses.map((m) => m.competencia);
  const compAtual = mesesComp.includes(competencia) ? competencia : mesesComp[mesesComp.length - 1];
  const atual = meses.find((m) => m.competencia === compAtual);
  const resumo = atual.resumo || {};
  const tiersRaw = atual.tiers || {};
  const analytics = atual.analytics || null;

  const tiersTotais = Object.fromEntries(Object.entries(tiersRaw).map(([k, v]) => [k, v.total]));
  const tiersAlta = Object.fromEntries(Object.entries(tiersRaw).map(([k, v]) => [k, v.alta]));
  const totalExcecoes = Object.values(tiersTotais).reduce((x, y) => x + y, 0);
  const resultadoAchados = gerarAchados(meses, compAtual);
  const totalAlta = Object.values(tiersAlta).reduce((x, y) => x + y, 0);
  const taxaConferido = resumo.colaboradores ? (((resumo.colaboradores - totalAlta) / resumo.colaboradores) * 100).toFixed(1) : '—';

  // Séries históricas — só entram meses que já têm o campo (analytics é novo;
  // meses processados antes dele existir mostram null e o gráfico só pula o ponto).
  const serieFinanceira = meses.map((m) => ({
    competencia: m.competencia,
    Proventos: m.resumo?.proventos ?? null,
    Líquido: m.resumo?.liquido ?? null,
  }));
  const serieHeadcount = meses.map((m) => ({
    competencia: m.competencia,
    Ativos: m.analytics?.ativos ?? null,
    Afastados: m.analytics?.afastadosTotal ?? null,
  }));
  const serieTurnover = meses.map((m) => ({
    competencia: m.competencia,
    Admissões: m.analytics?.admissoesNoMes ?? null,
    Demissões: m.analytics?.demitidos ?? null,
    Abandono: m.analytics?.abandono ?? null,
  }));
  const serieExcecoes = meses.map((m) => {
    const t = m.tiers || {};
    const total = Object.values(t).reduce((s, x) => s + (x.total || 0), 0);
    const alta = Object.values(t).reduce((s, x) => s + (x.alta || 0), 0);
    return { competencia: m.competencia, Total: total, 'Alta confiança': alta };
  });
  const serieHorasExtras = meses.map((m) => ({ competencia: m.competencia, 'Horas Extras (R$)': m.analytics?.horasExtras?.valorTotal ?? null }));

  const serieComposicao = meses.map((m) => {
    const an = m.analytics;
    if (!an) return { competencia: m.competencia };
    const adicionais = (an.adicionais?.periculosidade || 0) + (an.adicionais?.insalubridade || 0) + (an.adicionais?.adicionalNoturno || 0);
    const he = an.horasExtras?.valorTotal || 0;
    const beneficios = (an.beneficios?.va || 0) + (an.beneficios?.vt || 0);
    const proventos = an.financeiro?.proventos || 0;
    const demais = Math.max(proventos - adicionais - he - beneficios, 0);
    return { competencia: m.competencia, 'Salário base + demais': demais, Adicionais: adicionais, 'Horas Extras': he, Benefícios: beneficios };
  });

  const idxAtual = meses.findIndex((m) => m.competencia === compAtual);
  const mesAnteriorObj = idxAtual > 0 ? meses[idxAtual - 1] : null;
  const delta = (atualVal, antVal) => (atualVal == null || antVal == null || antVal === 0) ? null : ((atualVal - antVal) / Math.abs(antVal)) * 100;
  const deltaCusto = mesAnteriorObj ? delta(resumo.proventos, mesAnteriorObj.resumo?.proventos) : null;
  const deltaHeadcount = mesAnteriorObj ? (analytics?.ativos ?? null) - (mesAnteriorObj.analytics?.ativos ?? null) : null;
  const deltaExcecoes = mesAnteriorObj ? delta(totalAlta, Object.values(mesAnteriorObj.tiers || {}).reduce((s, x) => s + (x.alta || 0), 0)) : null;

  const cruz = estrutura && meses.length > 0
    ? cruzarChefias(meses.map((m) => ({ competencia: m.competencia, colaboradores: m.colaboradores })), estrutura.localParaChefia, estrutura.chefiasAdministrativas)
    : null;
  const alertas = gerarAlertas(meses, cruz);

  const DeltaTag = ({ v, invertido, sufixo = '%', casas = 1 }) => {
    if (v == null || Number.isNaN(v)) return null;
    const bom = invertido ? v <= 0 : v >= 0;
    return <span style={{ fontSize: 11, fontWeight: 700, color: bom ? BRAND.deep : '#D64545', marginLeft: 6 }}>{v > 0 ? '▲' : v < 0 ? '▼' : '—'} {Math.abs(v).toFixed(casas)}{sufixo}</span>;
  };

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageEyebrow}>Painel Executivo · RH {sincronizando && <span style={{ color: BRAND.teal }}>· ⟳ sincronizando com o Vetorh...</span>}</div>
          <h1 style={s.pageTitle}>Competência {compAtual}</h1>
        </div>
        <div style={s.compSwitch}>
          {mesesComp.map((c) => (
            <button key={c} onClick={() => setCompetencia(c)} style={{ ...s.compBtn, ...(c === compAtual ? s.compBtnActive : {}) }}>{c}</button>
          ))}
        </div>
      </div>

      <div style={s.statusBanner(resumo.status)}>
        {resumo.status === 'fechada'
          ? '✓ Folha conferida e fechada — integra o histórico oficial.'
          : `⚑ Em conferência — ${totalAlta} exceções de alta confiança aguardando revisão. ${taxaConferido}% da folha já validada sem ressalvas.`}
      </div>

      <div style={s.hexRow}>
        <HexKpi label="Colaboradores Ativos" value={fmtNum(analytics?.ativos ?? resumo.colaboradores ?? 0)}
          sub={<>{analytics ? `${fmtNum(analytics.afastadosTotal)} afastados` : ''}{deltaHeadcount != null && <DeltaTag v={deltaHeadcount} sufixo=" vs mês ant." casas={0} />}</>} />
        <HexKpi label="Custo de Folha" value={fmtBRL(resumo.proventos)}
          sub={<>{analytics ? `${fmtBRL(analytics.financeiro.custoMedioPorColaborador)} / colaborador` : ''}{deltaCusto != null && <DeltaTag v={deltaCusto} invertido />}</>} />
        <HexKpi label="Líquido Total" value={fmtBRL(resumo.liquido)} tone="good" />
        <HexKpi label="R$ em Risco" value={fmtBRL(resultadoAchados?.valorEmRisco ?? 0)}
          sub={<>{resultadoAchados?.achados.length ?? 0} achados ({totalExcecoes} itens){deltaExcecoes != null && <DeltaTag v={deltaExcecoes} invertido />}</>} tone={(resultadoAchados?.valorEmRisco ?? 0) > 0 ? 'danger' : 'good'} />
      </div>

      {alertas.length > 0 && (
        <div style={{ ...s.panel, marginBottom: 18 }}>
          <div style={s.panelTitle}>🔎 Central de Alertas — {compAtual}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alertas.map((al, i) => {
              const cores = { critico: '#D64545', atencao: '#C97A1B', info: BRAND.blue, positivo: BRAND.deep };
              const icones = { critico: '⛔', atencao: '⚑', info: 'ℹ', positivo: '✓' };
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#F7F9FA', borderLeft: `3px solid ${cores[al.nivel]}` }}>
                  <div style={{ fontSize: 15 }}>{icones[al.nivel]}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#22303A' }}>{al.titulo}</div>
                    <div style={{ fontSize: 12, color: BRAND.gray, marginTop: 2 }}>{al.detalhe}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {analytics && (
        <div style={s.hexRow}>
          <HexKpi label="Admissões no mês" value={fmtNum(analytics.admissoesNoMes)} />
          <HexKpi label="Demissões" value={fmtNum(analytics.demitidos)} tone={analytics.demitidos > 0 ? 'danger' : 'good'} />
          <HexKpi label="Abandono" value={fmtNum(analytics.abandono)} sub="não é demissão formal" tone={analytics.abandono > 0 ? 'danger' : 'good'} />
          <HexKpi label="Horas Extras Pagas" value={fmtBRL(analytics.horasExtras.valorTotal)} sub={`${fmtNum(analytics.horasExtras.colaboradoresComHE)} colaboradores`} />
        </div>
      )}

      <div style={s.grid2}>
        <div style={s.panel}>
          <div style={s.panelTitle}>Para onde vai o dinheiro — composição do custo (série)</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={serieComposicao} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Salário base + demais" stackId="1" stroke={BRAND.gray} fill={BRAND.gray} fillOpacity={0.25} connectNulls />
                <Area type="monotone" dataKey="Adicionais" stackId="1" stroke={BRAND.teal} fill={BRAND.teal} fillOpacity={0.45} connectNulls />
                <Area type="monotone" dataKey="Horas Extras" stackId="1" stroke="#C97A1B" fill="#C97A1B" fillOpacity={0.45} connectNulls />
                <Area type="monotone" dataKey="Benefícios" stackId="1" stroke={BRAND.blue} fill={BRAND.blue} fillOpacity={0.45} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 11, color: BRAND.gray, marginTop: 8 }}>"Salário base + demais" é o resíduo (proventos menos as três fatias rastreadas) — inclui salário base, 13º, férias e rubricas não categorizadas aqui.</p>
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>Exceções por camada de verificação</div>
          {Object.keys(tiersTotais).length > 0
            ? <SeverityPanel tiers={tiersTotais} alta={tiersAlta} />
            : <div style={{ fontSize: 12.5, color: BRAND.gray }}>Sem exceções calculadas para este mês.</div>}
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.panel}>
          <div style={s.panelTitle}>Custo de folha — Proventos x Líquido (série)</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={serieFinanceira} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Proventos" stroke={BRAND.blue} fill={BRAND.blue} fillOpacity={0.15} connectNulls />
                <Area type="monotone" dataKey="Líquido" stroke={BRAND.deep} fill={BRAND.deep} fillOpacity={0.15} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>Headcount por status detalhado ({compAtual})</div>
          {analytics?.headcountPorStatus?.length > 0 ? (
            <table style={s.table}>
              <thead><tr><th style={s.th}>Status</th><th style={s.th}>Colaboradores</th></tr></thead>
              <tbody>
                {[...analytics.headcountPorStatus].sort((a, b) => b.quantidade - a.quantidade).map((h) => (
                  <tr key={h.status} style={s.tr}>
                    <td style={s.td}>{h.status}</td>
                    <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{h.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={{ fontSize: 12.5, color: BRAND.gray }}>Sem detalhamento de status para este mês (reprocesse a competência).</div>}
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.panel}>
          <div style={s.panelTitle}>Headcount — Ativos x Afastados</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={serieHeadcount} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ativos" fill={BRAND.teal} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Afastados" fill="#D64545" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>Turnover — Admissões x Demissões x Abandono</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={serieTurnover} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Admissões" fill={BRAND.blue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Demissões" fill="#D64545" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Abandono" fill="#F0A93B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.panel}>
          <div style={s.panelTitle}>Conformidade — total de exceções x alta confiança</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={serieExcecoes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Total" stroke={BRAND.blue} strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="Alta confiança" stroke="#D64545" strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>Horas Extras pagas (R$) — série</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={serieHorasExtras} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Bar dataKey="Horas Extras (R$)" fill={BRAND.teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {analytics && (
        <div style={s.grid2}>
          <div style={s.panel}>
            <div style={s.panelTitle}>Top 10 centros de custo por proventos ({compAtual})</div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Centro de Custo</th><th style={s.th}>Colaboradores</th><th style={s.th}>Custo</th></tr></thead>
              <tbody>
                {analytics.topCentrosCusto.map((c) => (
                  <tr key={c.centro_custo} style={s.tr}>
                    <td style={s.td}>{c.centro_custo}</td>
                    <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{c.colaboradores}</td>
                    <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(c.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={s.panel}>
            <div style={s.panelTitle}>Top 10 cargos por custo total ({compAtual})</div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Cargo</th><th style={s.th}>Colaboradores</th><th style={s.th}>Custo</th></tr></thead>
              <tbody>
                {analytics.topCargosPorCusto.map((c) => (
                  <tr key={c.cargo} style={s.tr}>
                    <td style={s.td}>{c.cargo}</td>
                    <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{c.colaboradores}</td>
                    <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(c.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analytics && (
        <div style={s.grid2}>
          <div style={s.panel}>
            <div style={s.panelTitle}>Adicionais e Benefícios ({compAtual})</div>
            <div style={s.regionRow}><span style={{ fontSize: 13 }}>Periculosidade</span><b style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(analytics.adicionais.periculosidade)}</b></div>
            <div style={s.regionRow}><span style={{ fontSize: 13 }}>Insalubridade</span><b style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(analytics.adicionais.insalubridade)}</b></div>
            <div style={s.regionRow}><span style={{ fontSize: 13 }}>Adicional Noturno</span><b style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(analytics.adicionais.adicionalNoturno)}</b></div>
            <div style={s.regionRow}><span style={{ fontSize: 13 }}>Vale Alimentação</span><b style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(analytics.beneficios.va)}</b></div>
            <div style={s.regionRow}><span style={{ fontSize: 13 }}>Vale Transporte</span><b style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(analytics.beneficios.vt)}</b></div>
            <div style={s.regionRow}><span style={{ fontSize: 13 }}>Desc. VA não utilizado</span><b style={{ fontFamily: 'IBM Plex Mono, monospace', color: analytics.beneficios.vaNaoUtilizado > 0 ? '#D64545' : undefined }}>{fmtBRL(analytics.beneficios.vaNaoUtilizado)}</b></div>
            {analytics.multiCC > 0 && (
              <div style={{ fontSize: 11.5, color: '#D64545', marginTop: 10 }}>
                ⚑ {analytics.multiCC} colaboradores em múltiplos centros de custo no mês — checar antes de fechar a folha.
              </div>
            )}
          </div>
          <ActivityFeed />
        </div>
      )}

      {!analytics && (
        <div style={{ ...s.panel, marginTop: 18 }}>
          <div style={{ fontSize: 12.5, color: BRAND.gray }}>
            Essa competência foi processada antes do módulo de Analytics existir — reprocesse a folha em
            "Nova Conferência" pra popular headcount, turnover, horas extras e os demais indicadores aqui.
          </div>
        </div>
      )}
    </div>
  );
}

const MESES_LABEL = ['01 - Janeiro', '02 - Fevereiro', '03 - Março', '04 - Abril', '05 - Maio', '06 - Junho', '07 - Julho', '08 - Agosto', '09 - Setembro', '10 - Outubro', '11 - Novembro', '12 - Dezembro'];

function UploadScreen({ user, numEmp }) {
  const agora = new Date();
  const [mes, setMes] = useState(String(agora.getMonth() + 1).padStart(2, '0'));
  const [ano, setAno] = useState(agora.getFullYear());
  const competencia = `${mes}/${ano}`;
  const [fonte, setFonte] = useState('vetorh'); // 'vetorh' | 'pdf'
  const [arquivo, setArquivo] = useState(null);
  const [arquivoHE, setArquivoHE] = useState(null);
  const [arquivoFerias, setArquivoFerias] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | lendo | analisando | concluido | erro
  const [progresso, setProgresso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [statusExistente, setStatusExistente] = useState(null); // null | 'checando' | 'fechada' | 'em_conferencia' | 'inexistente'
  const [confirmaSobrescrita, setConfirmaSobrescrita] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [fechada, setFechada] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [mostrarConfigVetorh, setMostrarConfigVetorh] = useState(false);
  const [urlVetorh, setUrlVetorh] = useState(getVetorhApiUrl());
  const [chaveVetorh, setChaveVetorh] = useState(getVetorhApiKey());

  useEffect(() => {
    let cancelado = false;
    setStatusExistente('checando');
    setConfirmaSobrescrita(false);
    setFechada(false);
    lerCompetencia(numEmp, competencia).then((d) => {
      if (cancelado) return;
      setStatusExistente(d?.resumo?.status || 'inexistente');
    }).catch(() => { if (!cancelado) setStatusExistente('inexistente'); });
    return () => { cancelado = true; };
  }, [numEmp, competencia]);

  const ehFechada = statusExistente === 'fechada';
  const podeRodar = (fonte === 'vetorh' || !!arquivo) && status !== 'lendo' && status !== 'analisando'
    && (!ehFechada || (user?.admin && confirmaSobrescrita));

  const excluirEstaCompetencia = async () => {
    if (!window.confirm(`Excluir TODOS os dados de ${competencia} (resumo, exceções, analytics)? Essa ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    try {
      await excluirCompetencia(numEmp, competencia);
      await registrarAtividade(`Competência ${competencia} excluída por ${user?.nome || 'admin'} (limpeza de dado incorreto/duplicado).`, 'alerta');
      setStatusExistente('inexistente');
    } catch (e) {
      setErro('Não consegui excluir: ' + (e.message || ''));
    } finally {
      setExcluindo(false);
    }
  };

  const rodarConferencia = async () => {
    if (fonte === 'pdf' && !arquivo) return;
    if (ehFechada && !user?.admin) { setErro('Esta competência já está fechada. Apenas administradores podem sobrescrevê-la.'); setStatus('erro'); return; }
    if (ehFechada && !confirmaSobrescrita) return;
    setStatus('lendo'); setErro(''); setResultado(null);
    try {
      let colaboradores;
      if (fonte === 'vetorh') {
        colaboradores = await buscarFolhaVetorh(numEmp, competencia);
        if (!colaboradores || colaboradores.length === 0) throw new Error('O Vetorh não retornou nenhum colaborador pra essa empresa/competência. Confirma se o backend está rodando e se essa competência existe.');
      } else {
        const buffer = await arquivo.arrayBuffer();
        const texto = await extrairTextoLayout(buffer, (p, total) => setProgresso({ p, total }));
        colaboradores = parseFolha(texto);
        if (colaboradores.length === 0) throw new Error('Não consegui reconhecer nenhum colaborador neste PDF — confirma se é a Relação de Cálculo do Senior/Rubi.');
      }

      setStatus('analisando');

      let pontoPorMatricula = null;
      if (arquivoHE) {
        const bufferHE = await arquivoHE.arrayBuffer();
        const textoHE = await extrairTextoSequencial(bufferHE);
        pontoPorMatricula = parseHorasExtras(textoHE);
      }

      let excecoesT7 = [];
      if (arquivoFerias) {
        const bufferFerias = await arquivoFerias.arrayBuffer();
        const textoFerias = await extrairTextoLayout(bufferFerias);
        const recibos = parseRecibosFerias(textoFerias);
        excecoesT7 = tier7FeriasVencidas(recibos, competencia);
      }

      const nomeEmpresa = EMPRESAS.find((emp) => emp.numEmp === numEmp)?.nome || `empresa ${numEmp}`;
      const resultadoConferencia = await rodarEConfirmarConferencia(numEmp, competencia, colaboradores, {
        pontoPorMatricula, excecoesT7, fonte,
        origemLabel: `Sincronização manual (${nomeEmpresa}) via ${fonte === 'vetorh' ? 'Vetorh' : 'PDF'} —`,
        sobrescrita: ehFechada, nomeUsuario: user?.nome || 'admin',
      });

      setResultado(resultadoConferencia);
      setStatus('concluido');
      setStatusExistente('em_conferencia');
    } catch (e) {
      setErro(e.message || 'Algo deu errado ao processar a folha.');
      setStatus('erro');
    }
  };

  const fecharEstaCompetencia = async () => {
    setFechando(true);
    try {
      await fecharCompetencia(numEmp, competencia);
      await registrarAtividade(`Competência ${competencia} fechada por ${user?.nome || 'admin'} — não pode mais ser sobrescrita sem confirmação de administrador.`, 'info');
      setStatusExistente('fechada');
      setFechada(true);
    } catch (e) {
      setErro('Não consegui fechar a competência: ' + (e.message || ''));
    } finally {
      setFechando(false);
    }
  };

  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Sincronização Manual</div><h1 style={s.pageTitle}>Forçar sincronização ou subir PDF</h1></div></div>
      <div style={{ ...s.panel, marginBottom: 18, background: '#F7F9FA' }}>
        <div style={{ fontSize: 12.5, color: BRAND.gray, lineHeight: 1.6 }}>
          O Dashboard já sincroniza sozinho com o Vetorh, sem precisar disso aqui. Essa tela existe pra dois casos: <b>forçar</b> uma nova sincronização de um mês específico agora mesmo (sem esperar o ciclo automático), ou <b>subir um PDF manualmente</b> se a empresa ainda não estiver ligada ao Vetorh (ou se o backend estiver fora do ar).
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.panel}>
          <label style={s.label}>Competência</label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
            <select style={{ ...s.inputText, flex: 2 }} value={mes} onChange={(e) => setMes(e.target.value)}>
              {MESES_LABEL.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
            </select>
            <select style={{ ...s.inputText, flex: 1 }} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {Array.from({ length: 6 }, (_, i) => agora.getFullYear() - 2 + i).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 11.5, color: BRAND.gray, marginBottom: 8 }}>
            {statusExistente === 'checando' ? 'Checando...' : statusExistente === 'inexistente' ? `${competencia} ainda não tem dados salvos.` : `${competencia} já existe (status: ${statusExistente}).`}
          </div>
          {user?.admin && statusExistente && statusExistente !== 'inexistente' && statusExistente !== 'checando' && (
            <button onClick={excluirEstaCompetencia} disabled={excluindo}
              style={{ background: 'none', border: 'none', color: '#D64545', fontSize: 11.5, cursor: 'pointer', padding: 0, marginBottom: 14, textDecoration: 'underline' }}>
              {excluindo ? 'Excluindo...' : `🗑 Excluir todos os dados de ${competencia} (admin)`}
            </button>
          )}

          {ehFechada && (
            <div style={{ background: '#FDECEC', border: '1px solid #F3B4B4', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: '#8C2A2A' }}>
              🔒 <b>Esta competência já está fechada.</b> {user?.admin
                ? 'Você é administrador — pode sobrescrever, mas isso muda o histórico já auditado.'
                : 'Apenas administradores podem reprocessá-la. Fale com Gabriel, Juliana ou Shay.'}
            </div>
          )}
          {ehFechada && user?.admin && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#8C2A2A', marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmaSobrescrita} onChange={(e) => setConfirmaSobrescrita(e.target.checked)} style={{ marginTop: 2 }} />
              Confirmo que quero sobrescrever a folha fechada de {competencia} (ação fica registrada na auditoria).
            </label>
          )}

          <label style={s.label}>Fonte de dados</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setFonte('vetorh')} style={{ ...s.pill, ...(fonte === 'vetorh' ? s.pillActive : {}) }}>⚡ Buscar direto do Vetorh</button>
            <button onClick={() => setFonte('pdf')} style={{ ...s.pill, ...(fonte === 'pdf' ? s.pillActive : {}) }}>📄 Subir PDF</button>
          </div>

          {fonte === 'vetorh' ? (
            <div style={{ ...s.fileDrop, background: '#E4F6F8', border: '1.5px dashed #8FCFD6', textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: BRAND.deep, fontWeight: 600 }}>
                Sem arquivo nenhum — ao clicar em "Forçar sincronização", busca a folha de {competencia} direto do banco (Vetorh) agora mesmo, já filtrada pra essa empresa (útil se você não quer esperar o ciclo automático do Dashboard).
              </div>
              <button onClick={() => setMostrarConfigVetorh((v) => !v)} style={{ background: 'none', border: 'none', color: BRAND.deep, fontSize: 11.5, cursor: 'pointer', padding: 0, marginTop: 8, textDecoration: 'underline' }}>
                {mostrarConfigVetorh ? 'Esconder configuração da conexão' : '⚙ Configurar conexão com o backend'}
              </button>
              {mostrarConfigVetorh && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ ...s.label, marginBottom: 4 }}>Endereço do backend</label>
                    <input style={s.inputText} value={urlVetorh} onChange={(e) => setUrlVetorh(e.target.value)} placeholder="http://localhost:3001" />
                  </div>
                  <div>
                    <label style={{ ...s.label, marginBottom: 4 }}>Chave de API (a mesma do .env do backend)</label>
                    <input style={s.inputText} value={chaveVetorh} onChange={(e) => setChaveVetorh(e.target.value)} placeholder="CONFERE_GT_API_KEY do .env" />
                  </div>
                  <button style={{ ...s.btnSecondary, alignSelf: 'flex-start' }} onClick={() => {
                    setVetorhApiUrl(urlVetorh.trim()); setVetorhApiKey(chaveVetorh.trim()); setMostrarConfigVetorh(false);
                  }}>Salvar (fica guardado neste navegador)</button>
                </div>
              )}
              <div style={{ fontSize: 11.5, color: BRAND.gray, marginTop: 8 }}>
                Conectando em: <code>{getVetorhApiUrl()}</code>
              </div>
            </div>
          ) : (
            <>
              <label style={s.label}>Relação de Cálculo (PDF do Senior/Rubi)</label>
              <div style={s.fileDrop}>
                <input type="file" accept="application/pdf" style={s.fileInput}
                  onChange={(e) => setArquivo(e.target.files[0] || null)} />
                <div style={{ fontSize: 13, color: arquivo ? '#1A2B38' : BRAND.gray, fontWeight: arquivo ? 600 : 400 }}>
                  {arquivo ? `📄 ${arquivo.name}` : 'Clique ou arraste o PDF aqui'}
                </div>
              </div>
            </>
          )}

          <label style={s.label}>Relatório de Horas Extras / Ponto <span style={{ fontWeight: 400, color: BRAND.gray }}>(opcional — habilita Tiers 5 e 6)</span></label>
          <div style={s.fileDrop}>
            <input type="file" accept="application/pdf" style={s.fileInput}
              onChange={(e) => setArquivoHE(e.target.files[0] || null)} />
            <div style={{ fontSize: 13, color: arquivoHE ? '#1A2B38' : BRAND.gray, fontWeight: arquivoHE ? 600 : 400 }}>
              {arquivoHE ? `📄 ${arquivoHE.name}` : 'Clique ou arraste o PDF do ponto aqui (sem isso, Horas Extras e Dobras não são checadas)'}
            </div>
          </div>

          <label style={s.label}>Recibos de Férias do período <span style={{ fontWeight: 400, color: BRAND.gray }}>(opcional — habilita Tier 7, férias vencidas)</span></label>
          <div style={s.fileDrop}>
            <input type="file" accept="application/pdf" style={s.fileInput}
              onChange={(e) => setArquivoFerias(e.target.files[0] || null)} />
            <div style={{ fontSize: 13, color: arquivoFerias ? '#1A2B38' : BRAND.gray, fontWeight: arquivoFerias ? 600 : 400 }}>
              {arquivoFerias ? `📄 ${arquivoFerias.name}` : 'Clique ou arraste o lote de Recibos de Férias aqui'}
            </div>
          </div>

          <button style={{ ...s.btnPrimary, marginTop: 20 }} onClick={rodarConferencia}
            disabled={!podeRodar}>
            {status === 'lendo' ? `Lendo${progresso ? ` (página ${progresso.p}/${progresso.total})` : ''}…`
              : status === 'analisando' ? 'Rodando conferência…'
              : ehFechada ? 'Sobrescrever folha fechada'
              : fonte === 'vetorh' ? 'Forçar sincronização agora' : 'Subir PDF e rodar conferência'}
          </button>


          {status === 'erro' && <div style={{ ...s.errorText, marginTop: 12 }}>{erro}</div>}

          {status === 'concluido' && resultado && (
            <div style={s.resultBox}>
              <div style={{ fontWeight: 700, color: BRAND.deep, marginBottom: 10 }}>✓ Conferência concluída</div>
              <div style={s.resultRow}><span>Colaboradores processados</span><b>{fmtNum(resultado.colaboradores)}</b></div>
              <div style={s.resultRow}><span>Proventos</span><b>{fmtBRL(resultado.proventos)}</b></div>
              <div style={s.resultRow}><span>Líquido</span><b>{fmtBRL(resultado.liquido)}</b></div>
              <div style={s.resultRow}><span>Exceções (todas as camadas ativas)</span><b style={{ color: resultado.alta > 0 ? '#D64545' : BRAND.deep }}>{resultado.excecoes} ({resultado.alta} de alta confiança)</b></div>
              {!resultado.comHE && (
                <div style={{ fontSize: 11.5, color: '#C97A1B', marginTop: 6 }}>⚑ Sem relatório de ponto nesta rodada — Horas Extras (Tier 5) e Dobras (Tier 6) não foram checadas.</div>
              )}
              <div style={{ fontSize: 11.5, color: BRAND.gray, marginTop: 10, lineHeight: 1.5 }}>
                Salvo no Firebase em <code>folhas/{competencia.replace('/', '-')}</code>. Consulte a aba Exceções para o detalhe linha a linha.
              </div>
              {user?.admin && !fechada && statusExistente !== 'fechada' && (
                <button onClick={fecharEstaCompetencia} disabled={fechando}
                  style={{ ...s.btnSecondary, marginTop: 14, width: '100%' }}>
                  {fechando ? 'Fechando...' : `🔒 Fechar competência ${competencia} (admin)`}
                </button>
              )}
              {fechada && (
                <div style={{ fontSize: 12, color: BRAND.deep, marginTop: 12, fontWeight: 600 }}>
                  ✓ Competência {competencia} fechada. Só administradores podem reprocessá-la agora.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={s.panel}>
          <div style={s.panelTitle}>O que já roda de verdade</div>
          {Object.entries(TIER_META).map(([k, t]) => (
            <div key={k} style={s.checklistRow}>
              <Hex size={16} fill={BRAND.teal} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 11.5, color: BRAND.gray }}>
                  {t.desc} — ativo, rodando no seu navegador
                  {(k === 't5' || k === 't6') && ' (precisa do Relatório de Horas Extras/Ponto no upload)'}
                  {k === 't7' && ' (precisa dos Recibos de Férias no upload)'}
                </div>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 12, color: BRAND.gray, marginTop: 16, lineHeight: 1.6 }}>
            O PDF é lido inteiramente no seu navegador — nada é enviado a nenhum servidor externo
            além do próprio Firebase do Grupo GT. Nada aqui substitui o Senior; o Confere GT só confere.
          </p>
        </div>
      </div>

      {user?.admin && <BackfillHistoricoPanel numEmp={numEmp} user={user} />}
    </div>
  );
}

function BackfillHistoricoPanel({ numEmp, user }) {
  const [status, setStatus] = useState('idle'); // idle | rodando | concluido | erro
  const [progresso, setProgresso] = useState({ feito: 0, total: 0, atual: '', falhas: [] });
  const pararRef = useRef(false);

  const iniciarBackfill = async () => {
    const nomeEmpresa = EMPRESAS.find((e) => e.numEmp === numEmp)?.nome || `empresa ${numEmp}`;
    if (!window.confirm(`Isso vai copiar TODO o histórico do Vetorh (${nomeEmpresa}) pra dentro do Confere GT — pode levar vários minutos, uma vez só. Meses já sincronizados são pulados. Continuar?`)) return;
    pararRef.current = false;
    setStatus('rodando');
    try {
      const [competenciasVetorh, jaSincronizadas] = await Promise.all([
        listarCompetenciasVetorh(numEmp), listarCompetencias(numEmp),
      ]);
      const jaSincronizadasSet = new Set(jaSincronizadas);
      const pendentes = competenciasVetorh.filter((c) => !jaSincronizadasSet.has(c));
      setProgresso({ feito: 0, total: pendentes.length, atual: '', falhas: [] });

      if (pendentes.length === 0) {
        setStatus('concluido');
        return;
      }

      for (let i = 0; i < pendentes.length; i++) {
        if (pararRef.current) break;
        const comp = pendentes[i];
        setProgresso((p) => ({ ...p, atual: comp }));
        try {
          const colaboradores = await buscarFolhaVetorh(numEmp, comp);
          if (colaboradores?.length > 0) {
            await rodarEConfirmarConferencia(numEmp, comp, colaboradores, {
              fonte: 'vetorh', origemLabel: `Cópia única do histórico (${nomeEmpresa}) —`, nomeUsuario: user?.nome || 'admin',
            });
          }
        } catch (e) {
          setProgresso((p) => ({ ...p, falhas: [...p.falhas, { competencia: comp, erro: e.message }] }));
        }
        setProgresso((p) => ({ ...p, feito: i + 1 }));
        await new Promise((r) => setTimeout(r, 400)); // não martela o SQL Server
      }
      setStatus('concluido');
    } catch (e) {
      setProgresso((p) => ({ ...p, falhas: [...p.falhas, { competencia: '(geral)', erro: e.message }] }));
      setStatus('erro');
    }
  };

  return (
    <div style={{ ...s.panel, marginTop: 18, borderLeft: `4px solid ${BRAND.deep}` }}>
      <div style={s.panelTitle}>Cópia única do histórico completo</div>
      <p style={{ fontSize: 12.5, color: BRAND.gray, marginBottom: 14, lineHeight: 1.6 }}>
        Roda uma vez, copia todas as competências que ainda não estão no Confere GT (não repete as que já foram sincronizadas). Pode levar minutos com ~95 meses de histórico — não precisa ficar nessa tela, só não feche o navegador enquanto roda.
      </p>

      {status === 'idle' && <button style={s.btnPrimary} onClick={iniciarBackfill}>Iniciar cópia única do histórico</button>}

      {status === 'rodando' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Sincronizando {progresso.feito} de {progresso.total}... ({progresso.atual})
          </div>
          <div style={{ height: 8, background: '#EEF3F5', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${progresso.total ? (progresso.feito / progresso.total) * 100 : 0}%`, background: BRAND.teal, transition: 'width 0.3s' }} />
          </div>
          <button style={s.btnGhost} onClick={() => { pararRef.current = true; }}>Parar após o mês atual</button>
        </div>
      )}

      {status === 'concluido' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.deep, marginBottom: 8 }}>
            ✓ Concluído — {progresso.feito} de {progresso.total} meses processados.
          </div>
          {progresso.falhas.length > 0 && (
            <div style={{ fontSize: 12, color: '#D64545' }}>
              {progresso.falhas.length} falharam: {progresso.falhas.map((f) => f.competencia).join(', ')}. Pode rodar de novo — só reprocessa o que ainda falta.
            </div>
          )}
          <button style={{ ...s.btnSecondary, marginTop: 10 }} onClick={() => setStatus('idle')}>Fechar</button>
        </div>
      )}

      {status === 'erro' && (
        <div>
          <div style={{ fontSize: 13, color: '#D64545', marginBottom: 8 }}>Algo deu errado: {progresso.falhas[progresso.falhas.length - 1]?.erro}</div>
          <button style={s.btnSecondary} onClick={() => setStatus('idle')}>Tentar de novo</button>
        </div>
      )}
    </div>
  );
}

function DetalheExcecao({ item, onClose, onSalvarStatus }) {
  const [parecer, setParecer] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setParecer(item?.parecer || ''); }, [item]);
  if (!item) return null;

  const salvar = async (novoStatus) => {
    setSalvando(true);
    try { await onSalvarStatus(item, novoStatus, parecer); onClose(); }
    finally { setSalvando(false); }
  };

  const fmtValor = (v) => (typeof v === 'number' && Math.abs(v) < 100 ? `${v.toFixed(2)}h` : fmtBRL(v));

  return (
    <div style={s.drawerOverlay} onClick={onClose}>
      <div style={s.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={s.drawerHeader}>
          <div><div style={s.pageEyebrow}>{item.matricula}</div><h2 style={{ ...s.pageTitle, fontSize: 20 }}>{item.nome}</h2></div>
          <button style={s.linkBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.drawerMeta}>
          <span style={s.tierTag}>{TIER_META[item.tier]?.label || item.tier}</span>
          {item.centro_custo && <span style={s.tierTag}>{item.centro_custo}</span>}
          {item.cargo && <span style={s.tierTag}>{item.cargo}</span>}
          <span style={s.tierTag}>Confiança: {item.confianca}</span>
        </div>
        <div>
          <div style={s.drawerLabel}>Regra aplicada</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>{item.regra}</div>
          {item.obs && <div style={{ fontSize: 12.5, color: BRAND.gray, marginTop: 6 }}>{item.obs}</div>}
        </div>
        {item.esperado != null && (
          <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
            <div>
              <div style={s.drawerLabel}>Esperado</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17 }}>{fmtValor(item.esperado)}</div>
            </div>
            <div>
              <div style={s.drawerLabel}>Lançado</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17, color: '#D64545' }}>{fmtValor(item.lancado)}</div>
            </div>
            <div>
              <div style={s.drawerLabel}>Diferença</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17, color: item.diferenca < 0 ? '#D64545' : BRAND.deep }}>{fmtValor(item.diferenca)}</div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 22, borderTop: '1px solid #E7ECF0', paddingTop: 18 }}>
          <div style={s.drawerLabel}>Parecer / observação</div>
          <textarea style={s.textarea} placeholder="Registrar decisão do RH sobre este item…" value={parecer} onChange={(e) => setParecer(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button style={s.btnPrimary} disabled={salvando} onClick={() => salvar('resolvido')}>Marcar como resolvido</button>
            <button style={s.btnGhost} disabled={salvando} onClick={() => salvar('aguardando_rh')}>Encaminhar ao RH</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExcecoesScreen({ numEmp }) {
  const { loading, erro, meses } = useTodasCompetencias(numEmp);
  const [competencia, setCompetencia] = useState(null);
  const [tierAtivo, setTierAtivo] = useState('todos');
  const [selecionado, setSelecionado] = useState(null);
  const [modo, setModo] = useState('achados'); // 'achados' | 'lista'
  const [achadoAberto, setAchadoAberto] = useState(null);

  if (loading) return <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Exceções</div><h1 style={s.pageTitle}>Carregando...</h1></div></div>;
  if (erro) return <div style={s.panel}>{erro}</div>;
  if (meses.length === 0) return <div style={s.panel}>Nenhuma competência processada ainda — rode uma conferência em "Nova Conferência".</div>;

  const mesesComp = meses.map((m) => m.competencia);
  const compAtual = mesesComp.includes(competencia) ? competencia : mesesComp[mesesComp.length - 1];
  const atual = meses.find((m) => m.competencia === compAtual);
  const excecoesPorTier = atual.excecoes || {};

  const lista = [];
  for (const [tier, arr] of Object.entries(excecoesPorTier)) {
    (arr || []).forEach((e, idx) => { if (e) lista.push({ ...e, tier, idx }); });
  }
  const filtrada = tierAtivo === 'todos' ? lista : lista.filter((e) => e.tier === tierAtivo);
  const statusChip = { revisar: ['A revisar', BRAND.gray], em_correcao: ['Em correção', BRAND.blue], aguardando_rh: ['Aguardando RH', '#D64545'], resolvido: ['Resolvido', BRAND.teal] };

  const salvarStatus = async (item, novoStatus, parecer) => {
    await atualizarStatusExcecao(numEmp, compAtual, item.tier, String(item.idx), novoStatus, parecer);
    await registrarAtividade(`${item.nome} (${item.matricula}) marcado como "${statusChip[novoStatus]?.[0] || novoStatus}" em ${item.regra}.`, novoStatus === 'resolvido' ? 'resolvido' : 'info');
  };

  const resultadoAchados = gerarAchados(meses, compAtual);

  const renderTabela = (linhas) => (
    <table style={s.table}>
      <thead><tr><th style={s.th}>Colaborador</th><th style={s.th}>Cargo / Centro de Custo</th><th style={s.th}>Regra</th><th style={s.th}>Diferença</th><th style={s.th}>Confiança</th><th style={s.th}>Status</th></tr></thead>
      <tbody>
        {linhas.map((e) => {
          const chip = statusChip[e.status] || (e.confianca === 'alta' ? statusChip.aguardando_rh : statusChip.revisar);
          return (
            <tr key={`${e.tier}-${e.idx}`} style={{ ...s.tr, cursor: 'pointer' }} onClick={() => setSelecionado(e)}>
              <td style={s.td}>
                <div style={{ fontWeight: 600 }}>{e.nome} {e.reincidente && <span title="Reincidente vs mês anterior" style={{ fontSize: 10, color: '#D64545' }}>⟲ reincidente</span>}</div>
                <div style={{ fontSize: 11, color: BRAND.gray, fontFamily: 'IBM Plex Mono, monospace' }}>{e.matricula}</div>
              </td>
              <td style={s.td}><div>{e.cargo}</div><div style={{ fontSize: 11, color: BRAND.gray }}>{e.centro_custo}</div></td>
              <td style={{ ...s.td, maxWidth: 340 }}>{e.regra}</td>
              <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace', color: e.diferenca < 0 ? '#D64545' : BRAND.deep }}>
                {typeof e.diferenca === 'number' ? (Math.abs(e.diferenca) < 100 ? `${e.diferenca.toFixed(2)}h` : fmtBRL(e.diferenca)) : '—'}
              </td>
              <td style={s.td}>
                <span style={{ ...s.statusChip, color: e.confianca === 'alta' ? '#D64545' : BRAND.gray, borderColor: e.confianca === 'alta' ? '#D64545' : BRAND.gray }}>
                  {e.confianca === 'alta' ? 'Alta' : 'Revisar'}
                </span>
              </td>
              <td style={s.td}><span style={{ ...s.statusChip, color: chip[1], borderColor: chip[1] }}>{chip[0]}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageEyebrow}>Competência {compAtual}</div><h1 style={s.pageTitle}>Exceções</h1></div>
        <div style={s.compSwitch}>
          {mesesComp.map((c) => (
            <button key={c} onClick={() => { setCompetencia(c); setTierAtivo('todos'); setAchadoAberto(null); }} style={{ ...s.compBtn, ...(c === compAtual ? s.compBtnActive : {}) }}>{c}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setModo('achados')} style={{ ...s.pill, ...(modo === 'achados' ? s.pillActive : {}) }}>Achados (agrupado)</button>
        <button onClick={() => setModo('lista')} style={{ ...s.pill, ...(modo === 'lista' ? s.pillActive : {}) }}>Lista completa ({lista.length})</button>
      </div>

      {modo === 'achados' && resultadoAchados && (
        <>
          <div style={s.hexRow}>
            <HexKpi label="R$ em Risco" value={fmtBRL(resultadoAchados.valorEmRisco)} sub="alta confiança, valores monetários" tone={resultadoAchados.valorEmRisco > 0 ? 'danger' : 'good'} />
            <HexKpi label="Achados (causas raiz)" value={fmtNum(resultadoAchados.achados.length)} sub={`de ${resultadoAchados.totalAposFiltro} itens materiais`} />
            <HexKpi label="Reincidências" value={fmtNum(resultadoAchados.achados.reduce((s, a) => s + a.reincidentes, 0))} sub="mesmo colaborador, mesmo erro, mês passado" tone={resultadoAchados.achados.some((a) => a.reincidentes > 0) ? 'danger' : 'good'} />
            <HexKpi label="Abaixo da Materialidade" value={fmtNum(resultadoAchados.itensAbaixoMaterialidade)} sub="filtrado (< R$5 ou < 1h) — não exibido" />
          </div>

          {resultadoAchados.achados.length === 0 ? (
            <div style={s.panel}>Nenhum achado material em {compAtual}. 🎉</div>
          ) : (
            <div style={s.panel}>
              <div style={s.panelTitle}>Achados por causa raiz — ordenado por impacto financeiro</div>
              <p style={{ fontSize: 11.5, color: BRAND.gray, marginBottom: 14 }}>
                Cada linha é UMA causa, não um colaborador — clica pra ver todo mundo afetado por ela. Diferenças abaixo de R$5,00 (ou 1h em regras de hora) já foram filtradas por não serem materiais.
              </p>
              <table style={s.table}>
                <thead><tr><th style={s.th}>Camada</th><th style={s.th}>Causa</th><th style={s.th}>Colaboradores</th><th style={s.th}>Reincidentes</th><th style={s.th}>Impacto</th><th style={s.th}>Confiança</th></tr></thead>
                <tbody>
                  {resultadoAchados.achados.map((a, i) => (
                    <React.Fragment key={i}>
                      <tr style={{ ...s.tr, cursor: 'pointer', background: achadoAberto === i ? '#F3F8FA' : undefined }} onClick={() => setAchadoAberto(achadoAberto === i ? null : i)}>
                        <td style={s.td}><span style={s.tierTag}>{TIER_META[a.tier]?.label || a.tier}</span></td>
                        <td style={{ ...s.td, maxWidth: 380, fontWeight: 600 }}>{achadoAberto === i ? '▾' : '▸'} {a.regra}</td>
                        <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{a.quantidade}</td>
                        <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace', color: a.reincidentes > 0 ? '#D64545' : '#33414D' }}>{a.reincidentes > 0 ? `${a.reincidentes} ⟲` : '—'}</td>
                        <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(a.impactoTotal)}</td>
                        <td style={s.td}>
                          <span style={{ ...s.statusChip, color: a.confianca === 'alta' ? '#D64545' : BRAND.gray, borderColor: a.confianca === 'alta' ? '#D64545' : BRAND.gray }}>
                            {a.confianca === 'alta' ? 'Alta' : 'Revisar'}
                          </span>
                        </td>
                      </tr>
                      {achadoAberto === i && (
                        <tr>
                          <td colSpan={6} style={{ padding: '0 0 16px 0', background: '#FAFBFC' }}>
                            {renderTabela(a.itens.map((it) => ({ ...it, tier: a.tier })))}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modo === 'lista' && (
        <>
          <div style={s.pillRow}>
            <button onClick={() => setTierAtivo('todos')} style={{ ...s.pill, ...(tierAtivo === 'todos' ? s.pillActive : {}) }}>Todas ({lista.length})</button>
            {Object.entries(TIER_META).map(([k, v]) => {
              const n = lista.filter((e) => e.tier === k).length;
              if (!n) return null;
              return <button key={k} onClick={() => setTierAtivo(k)} style={{ ...s.pill, ...(tierAtivo === k ? s.pillActive : {}) }}>{v.label} ({n})</button>;
            })}
          </div>
          {filtrada.length === 0 ? (
            <div style={s.panel}>Nenhuma exceção nessa camada para {compAtual}. 🎉</div>
          ) : (
            <div style={s.panel}>{renderTabela(filtrada)}</div>
          )}
        </>
      )}

      <DetalheExcecao item={selecionado} onClose={() => setSelecionado(null)} onSalvarStatus={salvarStatus} />
    </div>
  );
}

function HistoricoScreen({ user, numEmp }) {
  const { loading, erro, meses, recarregar } = useTodasCompetencias(numEmp);

  if (loading) return <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Série Mensal</div><h1 style={s.pageTitle}>Carregando...</h1></div></div>;
  if (erro) return <div style={s.panel}>{erro}</div>;
  if (meses.length === 0) return <div style={s.panel}>Nenhuma competência processada ainda.</div>;

  const excluir = async (competencia) => {
    if (!window.confirm(`Excluir TODOS os dados de "${competencia}"? Essa ação não pode ser desfeita.`)) return;
    await excluirCompetencia(numEmp, competencia);
    await registrarAtividade(`Competência "${competencia}" excluída por ${user?.nome || 'admin'} (limpeza via Histórico).`, 'alerta');
    recarregar();
  };

  const serie = meses.map((m) => {
    const t = m.tiers || {};
    const alta = Object.values(t).reduce((a, b) => a + (b.alta || 0), 0);
    const total = Object.values(t).reduce((a, b) => a + (b.total || 0), 0);
    const colaboradores = m.resumo?.colaboradores || 0;
    return {
      competencia: m.competencia,
      Líquido: m.resumo?.liquido ?? null,
      'Taxa alta confiança (%)': colaboradores ? Number(((alta / colaboradores) * 100).toFixed(2)) : 0,
      Ativos: m.analytics?.ativos ?? null,
      Admissões: m.analytics?.admissoesNoMes ?? null,
      Demissões: m.analytics?.demitidos ?? null,
      total, alta,
      colaboradores,
      proventos: m.resumo?.proventos ?? null,
      status: m.resumo?.status,
    };
  });

  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Série Mensal</div><h1 style={s.pageTitle}>Histórico & KPIs</h1></div></div>
      <div style={s.grid2}>
        <div style={s.panel}>
          <div style={s.panelTitle}>Líquido pago por competência</div>
          <div style={{ width: '100%', height: 190 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Bar dataKey="Líquido" fill={BRAND.deep} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>Taxa de exceção de alta confiança</div>
          <div style={{ width: '100%', height: 190 }}>
            <ResponsiveContainer>
              <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="Taxa alta confiança (%)" stroke="#D64545" strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div style={{ ...s.panel, marginTop: 18 }}>
        <div style={s.panelTitle}>Evolução mês a mês</div>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Competência</th><th style={s.th}>Colaboradores</th><th style={s.th}>Proventos</th><th style={s.th}>Líquido</th><th style={s.th}>Exceções (alta)</th><th style={s.th}>Status</th>{user?.admin && <th style={s.th}></th>}</tr></thead>
          <tbody>
            {serie.map((m) => (
              <tr key={m.competencia} style={s.tr}>
                <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{m.competencia}</td>
                <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtNum(m.colaboradores)}</td>
                <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(m.proventos)}</td>
                <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(m.Líquido)}</td>
                <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace', color: m.alta > 0 ? '#D64545' : '#33414D' }}>{m.alta} / {m.total}</td>
                <td style={s.td}>
                  <span style={{ ...s.statusChip, color: m.status === 'fechada' ? BRAND.deep : '#D64545', borderColor: m.status === 'fechada' ? BRAND.deep : '#D64545' }}>
                    {m.status === 'fechada' ? 'Fechada' : m.status || 'incompleta'}
                  </span>
                </td>
                {user?.admin && (
                  <td style={s.td}>
                    <button onClick={() => excluir(m.competencia)} style={{ background: 'none', border: 'none', color: '#D64545', cursor: 'pointer', fontSize: 12 }} title="Excluir competência">🗑</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useEstruturaOrganizacional(numEmp) {
  const [estado, setEstado] = useState({ loading: true, dados: null });
  const recarregar = () => {
    if (!numEmp) return;
    setEstado((s) => ({ ...s, loading: true }));
    lerEstruturaOrganizacional(numEmp).then((d) => setEstado({ loading: false, dados: d })).catch(() => setEstado({ loading: false, dados: null }));
  };
  useEffect(recarregar, [numEmp]);
  return { ...estado, recarregar };
}

function UploadEstruturaPanel({ numEmp, estrutura, onAtualizado }) {
  const [arquivo, setArquivo] = useState(null);
  const [status, setStatus] = useState('idle');
  const [erro, setErro] = useState('');

  const processar = async () => {
    if (!arquivo) return;
    setStatus('lendo'); setErro('');
    try {
      const buffer = await arquivo.arrayBuffer();
      const texto = await extrairTextoLayout(buffer);
      setStatus('processando');
      const r = parseRelatorioChefia(texto);
      await salvarEstruturaOrganizacional(numEmp, r);
      await registrarAtividade(`Estrutura organizacional atualizada: ${r.totalChefias} chefias, ${r.totalLocais} locais mapeados (${r.chefiasAdministrativas.length} bucket(s) administrativo(s) detectado(s) automaticamente).`, 'info');
      setStatus('ok');
      setArquivo(null);
      onAtualizado();
    } catch (e) {
      setErro(e.message || 'Não consegui ler este PDF.');
      setStatus('erro');
    }
  };

  return (
    <div style={s.panel}>
      <div style={s.panelTitle}>Estrutura Organizacional (Relatório de Chefia)</div>
      {estrutura ? (
        <div style={{ fontSize: 12.5, color: BRAND.gray, marginBottom: 12, lineHeight: 1.6 }}>
          Atualizada em {new Date(estrutura.atualizadoEm).toLocaleString('pt-BR')} — <b style={{ color: '#334552' }}>{estrutura.totalChefias} chefias</b>, {estrutura.totalLocais} locais mapeados
          {estrutura.chefiasAdministrativas?.length > 0 && <> · {estrutura.chefiasAdministrativas.length} bucket(s) administrativo(s) detectado(s) automaticamente (excluído do ranking)</>}.
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: '#D64545', marginBottom: 12 }}>
          Nenhuma estrutura carregada ainda — suba o Relatório de Chefia (FPRE120) pra habilitar o ranking abaixo.
        </div>
      )}
      <div style={s.fileDrop}>
        <input type="file" accept="application/pdf" style={s.fileInput} onChange={(e) => setArquivo(e.target.files[0] || null)} />
        <div style={{ fontSize: 13, color: arquivo ? '#1A2B38' : BRAND.gray, fontWeight: arquivo ? 600 : 400 }}>
          {arquivo ? `📄 ${arquivo.name}` : 'Clique ou arraste o Relatório de Chefia (PDF) aqui'}
        </div>
      </div>
      <button style={{ ...s.btnPrimary, marginTop: 14 }} onClick={processar} disabled={!arquivo || status === 'lendo' || status === 'processando'}>
        {status === 'lendo' ? 'Lendo PDF…' : status === 'processando' ? 'Processando…' : estrutura ? 'Atualizar estrutura' : 'Carregar estrutura'}
      </button>
      {status === 'erro' && <div style={{ ...s.errorText, marginTop: 10 }}>{erro}</div>}
      {status === 'ok' && <div style={{ fontSize: 12.5, color: BRAND.deep, marginTop: 10, fontWeight: 600 }}>✓ Estrutura atualizada com sucesso.</div>}
    </div>
  );
}

function ChefiasScreen({ numEmp }) {
  const { loading: loadingMeses, erro: erroMeses, meses } = useTodasCompetencias(numEmp);
  const { loading: loadingEstrutura, dados: estrutura, recarregar } = useEstruturaOrganizacional(numEmp);
  const [mostrarTodasTransf, setMostrarTodasTransf] = useState(false);

  if (loadingMeses || loadingEstrutura) {
    return <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Estrutura & Chefias</div><h1 style={s.pageTitle}>Carregando...</h1></div></div>;
  }

  const cruz = estrutura && meses.length > 0
    ? cruzarChefias(meses.map((m) => ({ competencia: m.competencia, colaboradores: m.colaboradores })), estrutura.localParaChefia, estrutura.chefiasAdministrativas)
    : null;

  const ranking = cruz ? [...cruz.ranking].sort((a, b) => b.headcountAtual - a.headcountAtual) : [];
  const maiorTurnover = ranking.length ? [...ranking].sort((a, b) => ((b.demissoes + b.abandono) / Math.max(b.headcountAtual, 1)) - ((a.demissoes + a.abandono) / Math.max(a.headcountAtual, 1)))[0] : null;
  const maisTransferencias = ranking.length ? [...ranking].sort((a, b) => b.transferencias - a.transferencias)[0] : null;

  const serieGrafico = ranking.map((r) => ({ chefia: r.chefia.split(' ').slice(0, 2).join(' '), Admissões: r.admissoes, Demissões: r.demissoes, Abandono: r.abandono }));

  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Estrutura Organizacional</div><h1 style={s.pageTitle}>Chefias & Postos</h1></div></div>

      <UploadEstruturaPanel numEmp={numEmp} estrutura={estrutura} onAtualizado={recarregar} />

      {!estrutura && (
        <div style={{ ...s.panel, marginTop: 18 }}>
          Sem estrutura carregada ainda não dá pra calcular o ranking por Chefia. Suba o Relatório de Chefia acima — é o mesmo tipo de PDF que o Depto. Pessoal já tira do Senior (FPRE120 - Relação de Empregados por Chefia).
        </div>
      )}

      {estrutura && meses.length === 0 && (
        <div style={{ ...s.panel, marginTop: 18 }}>Nenhuma competência processada ainda em "Nova Conferência" — o cruzamento precisa de pelo menos um mês de folha.</div>
      )}

      {cruz && ranking.length > 0 && (
        <>
          <div style={s.hexRow}>
            <HexKpi label="Chefias Operacionais" value={fmtNum(ranking.length)} sub={cruz.pipelineAdministrativo.length > 0 ? `+ ${cruz.pipelineAdministrativo.length} bucket administrativo` : undefined} />
            <HexKpi label="Maior Turnover" value={maiorTurnover ? fmtPct(((maiorTurnover.demissoes + maiorTurnover.abandono) / Math.max(maiorTurnover.headcountAtual, 1)) * 100) : '—'} sub={maiorTurnover?.chefia} tone="danger" />
            <HexKpi label="Mais Transferências" value={maisTransferencias ? fmtNum(maisTransferencias.transferencias) : '—'} sub={maisTransferencias?.chefia} />
            <HexKpi label="Centros de Custo Não Mapeados" value={fmtNum(cruz.semCorrespondencia.length)} sub={cruz.semCorrespondencia.length > 0 ? 'checar grafia' : 'tudo mapeado'} tone={cruz.semCorrespondencia.length > 0 ? 'danger' : 'good'} />
          </div>

          <div style={s.panel}>
            <div style={s.panelTitle}>Admissões x Demissões x Abandono por Chefia (semestre)</div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={serieGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F5" />
                  <XAxis dataKey="chefia" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Admissões" fill={BRAND.blue} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Demissões" fill="#D64545" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Abandono" fill="#F0A93B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...s.panel, marginTop: 18 }}>
            <div style={s.panelTitle}>Ranking por Chefia (semestre até {meses[meses.length - 1].competencia})</div>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Chefia</th><th style={s.th}>Headcount</th><th style={s.th}>Custo (mês atual)</th>
                <th style={s.th}>Admissões</th><th style={s.th}>Demissões</th><th style={s.th}>Abandono</th>
                <th style={s.th}>Turnover</th><th style={s.th}>Transferências</th><th style={s.th}>Férias (m-p)</th><th style={s.th}>Saúde (m-p)</th>
              </tr></thead>
              <tbody>
                {ranking.map((r) => {
                  const turnover = ((r.demissoes + r.abandono) / Math.max(r.headcountAtual, 1)) * 100;
                  return (
                    <tr key={r.chefia} style={s.tr}>
                      <td style={s.td}>{r.chefia}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{r.headcountAtual}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(r.custoAtual)}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{r.admissoes}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{r.demissoes}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{r.abandono}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace', color: turnover > 10 ? '#D64545' : '#33414D' }}>{turnover.toFixed(1)}%</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{r.transferencias}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{r.ferias}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{r.saude}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: BRAND.gray, marginTop: 12 }}>
              Turnover = (Demissões + Abandono) / Headcount atual, simplificado pro semestre — serve pra comparar chefias entre si, não é taxa anualizada.
              Transferência = colaborador mudou de cargo e/ou centro de custo entre um mês e o seguinte, incluindo passagens por posto-volante.
            </p>
          </div>

          {cruz.pipelineAdministrativo.length > 0 && (
            <div style={{ ...s.panel, marginTop: 18, borderLeft: '4px solid #D64545' }}>
              <div style={s.panelTitle}>⚑ Pipeline Administrativo (não é chefia de campo)</div>
              <p style={{ fontSize: 12.5, color: BRAND.gray, marginBottom: 12 }}>
                Detectado automaticamente: todo posto vinculado a esta(s) "chefia(s)" é um bucket de trânsito do Depto. Pessoal
                (volante em abandono, grávida em estabilidade, inativo ou em rescisão) — não meça desempenho de gestão aqui.
              </p>
              {cruz.pipelineAdministrativo.map((p) => (
                <div key={p.chefia} style={s.regionRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.chefia}</div>
                    <div style={{ fontSize: 11, color: BRAND.gray }}>Headcount remanescente: {p.headcountAtual}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>
                    <div>Demissões: {p.demissoes} · Abandono: {p.abandono}</div>
                    <div style={{ color: BRAND.gray }}>Saúde (m-p): {p.saude}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...s.panel, marginTop: 18 }}>
            <div style={s.panelTitle}>Transferências detectadas ({cruz.transferencias.length})</div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Mês</th><th style={s.th}>Chefia</th><th style={s.th}>Colaborador</th><th style={s.th}>Cargo</th><th style={s.th}>Centro de Custo</th></tr></thead>
              <tbody>
                {(mostrarTodasTransf ? cruz.transferencias : cruz.transferencias.slice(0, 25)).map((t, i) => (
                  <tr key={i} style={s.tr}>
                    <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{t.mes}</td>
                    <td style={s.td}>{t.chefia || '(sem correspondência)'}</td>
                    <td style={s.td}>{t.nome}</td>
                    <td style={s.td}>{t.cargoDe === t.cargoPara ? t.cargoPara : `${t.cargoDe} → ${t.cargoPara}`}</td>
                    <td style={{ ...s.td, fontSize: 11.5 }}>{t.ccDe} → {t.ccPara}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cruz.transferencias.length > 25 && (
              <button style={{ ...s.btnSecondary, marginTop: 12 }} onClick={() => setMostrarTodasTransf((v) => !v)}>
                {mostrarTodasTransf ? 'Mostrar menos' : `Mostrar todas (${cruz.transferencias.length})`}
              </button>
            )}
          </div>

          {cruz.semCorrespondencia.length > 0 && (
            <div style={{ ...s.panel, marginTop: 18 }}>
              <div style={s.panelTitle}>Qualidade de Dado — centros de custo sem Chefia mapeada</div>
              <p style={{ fontSize: 12.5, color: BRAND.gray, marginBottom: 12 }}>
                Provável causa: diferença de grafia entre a folha e o Relatório de Chefia (espaço extra em nomes por artefato de extração de PDF).
                Padronizar os nomes de posto nos dois sistemas resolve isso.
              </p>
              <table style={s.table}>
                <thead><tr><th style={s.th}>Centro de Custo</th><th style={s.th}>Ocorrências (mês-colaborador)</th></tr></thead>
                <tbody>
                  {cruz.semCorrespondencia.slice(0, 20).map((s2) => (
                    <tr key={s2.centroCusto} style={s.tr}>
                      <td style={s.td}>{s2.centroCusto}</td>
                      <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{s2.ocorrencias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const JANELAS_PADRAO = [
  { label: '3 meses', valor: 3 }, { label: '6 meses', valor: 6 }, { label: '12 meses', valor: 12 },
  { label: '24 meses', valor: 24 }, { label: 'Todo o histórico', valor: null },
];

function AnaliseHistoricaScreen({ numEmp }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [achados, setAchados] = useState([]);
  const [todasCompetencias, setTodasCompetencias] = useState([]);
  const [competenciaRef, setCompetenciaRef] = useState(null); // null = a mais recente
  const [janela, setJanela] = useState(6); // meses pra trás a partir da referência; null = tudo
  const [filtro, setFiltro] = useState('todos'); // todos | parou | comecou | buraco
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!numEmp) return;
    let cancelado = false;
    (async () => {
      try {
        const competencias = await listarCompetenciasVetorh(numEmp);
        if (!cancelado) setTodasCompetencias(competencias);
      } catch (e) {
        if (!cancelado) setErro(e.message || 'Falha ao buscar competências do Vetorh.');
      }
    })();
    return () => { cancelado = true; };
  }, [numEmp]);

  const chaveOrd = (c) => { const [m, a] = c.split('/'); return `${a}-${m.padStart(2, '0')}`; };
  const ordenadas = [...todasCompetencias].sort((a, b) => chaveOrd(b).localeCompare(chaveOrd(a))); // mais recente primeiro
  const refEfetiva = competenciaRef || ordenadas[0] || null;
  const idxRef = ordenadas.indexOf(refEfetiva);
  const desde = janela && idxRef >= 0 ? ordenadas[Math.min(idxRef + janela - 1, ordenadas.length - 1)] : null;

  useEffect(() => {
    if (!numEmp || !refEfetiva) return;
    let cancelado = false;
    setCarregando(true); setErro(null);
    (async () => {
      try {
        const serie = await historicoRubricaPorCentroCustoVetorh(numEmp, desde, refEfetiva);
        if (cancelado) return;
        const competenciasNaJanela = janela ? ordenadas.slice(idxRef, idxRef + janela) : ordenadas;
        const encontrados = detectarMudancasRubrica(serie, competenciasNaJanela);
        setAchados(encontrados);
      } catch (e) {
        if (!cancelado) setErro(e.message || 'Falha ao buscar o histórico do Vetorh.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [numEmp, refEfetiva, janela]);

  const filtrados = achados
    .filter((a) => filtro === 'todos' || a.tipo === filtro)
    .filter((a) => !busca || `${a.nomCCU} ${a.desRub}`.toLowerCase().includes(busca.toLowerCase()));

  const rotuloTipo = { parou: ['⛔ Parou de pagar', '#D64545'], comecou: ['🆕 Começou a pagar', BRAND.blue], buraco: ['⚑ Interrupção no meio', '#C97A1B'] };

  if (ordenadas.length === 0 && !erro) {
    return <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Análise Histórica</div><h1 style={s.pageTitle}>Buscando competências disponíveis no Vetorh...</h1></div></div>;
  }
  if (erro) {
    return (
      <div>
        <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Análise Histórica</div><h1 style={s.pageTitle}>Não consegui carregar</h1></div></div>
        <div style={s.panel}>{erro}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageEyebrow}>Análise Histórica · janela de {janela || 'todo o'} {janela ? 'meses' : 'histórico'}</div>
          <h1 style={s.pageTitle}>Mudanças de rubrica ao longo do tempo</h1>
        </div>
      </div>

      <div style={{ ...s.panel, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <label style={{ ...s.label, marginBottom: 4 }}>Competência de referência</label>
            <select style={s.inputText} value={refEfetiva || ''} onChange={(e) => setCompetenciaRef(e.target.value)}>
              {ordenadas.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, marginBottom: 4 }}>Cruzar quantos meses pra trás</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {JANELAS_PADRAO.map((j) => (
                <button key={j.label} onClick={() => setJanela(j.valor)} style={{ ...s.pill, ...(janela === j.valor ? s.pillActive : {}) }}>{j.label}</button>
              ))}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: BRAND.gray, lineHeight: 1.6, margin: 0 }}>
          {carregando ? 'Buscando e cruzando o período selecionado direto do Vetorh...' : (
            <>Cruzando de <b>{desde || ordenadas[ordenadas.length - 1]}</b> até <b>{refEfetiva}</b> — encontrou <b>{achados.length} mudanças de padrão</b> sozinho: rubricas que começaram a ser pagas, que pararam, ou que tiveram um período de silêncio no meio. É heurístico (materialidade mínima de R$30/mês, silêncio de 3+ meses) — sinaliza pra sua revisão, não afirma que é erro.</>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setFiltro('todos')} style={{ ...s.pill, ...(filtro === 'todos' ? s.pillActive : {}) }}>Todos ({achados.length})</button>
        <button onClick={() => setFiltro('parou')} style={{ ...s.pill, ...(filtro === 'parou' ? s.pillActive : {}) }}>Parou de pagar ({achados.filter((a) => a.tipo === 'parou').length})</button>
        <button onClick={() => setFiltro('comecou')} style={{ ...s.pill, ...(filtro === 'comecou' ? s.pillActive : {}) }}>Começou a pagar ({achados.filter((a) => a.tipo === 'comecou').length})</button>
        <button onClick={() => setFiltro('buraco')} style={{ ...s.pill, ...(filtro === 'buraco' ? s.pillActive : {}) }}>Interrupções ({achados.filter((a) => a.tipo === 'buraco').length})</button>
        <input style={{ ...s.inputText, maxWidth: 260, marginLeft: 'auto' }} placeholder="Filtrar por centro de custo ou rubrica..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {filtrados.length === 0 ? (
        <div style={s.panel}>Nenhuma mudança encontrada com esse filtro.</div>
      ) : (
        <div style={s.panel}>
          <table style={s.table}>
            <thead><tr><th style={s.th}>Tipo</th><th style={s.th}>Centro de Custo</th><th style={s.th}>Rubrica</th><th style={s.th}>Detalhe</th><th style={s.th}>Média mensal ativo</th></tr></thead>
            <tbody>
              {filtrados.map((a, i) => (
                <tr key={i} style={s.tr}>
                  <td style={s.td}><span style={{ ...s.tierTag, color: rotuloTipo[a.tipo][1], background: 'transparent', border: `1px solid ${rotuloTipo[a.tipo][1]}` }}>{rotuloTipo[a.tipo][0]}</span></td>
                  <td style={s.td}>{a.nomCCU || a.codCCU}</td>
                  <td style={s.td}>{a.desRub}</td>
                  <td style={{ ...s.td, fontSize: 12 }}>
                    {a.tipo === 'parou' && <>Última vez pago em <b>{a.ultimaVezPago}</b> — {a.mesesParado} meses sem pagar até hoje (pagou em {a.totalMesesPagos} meses ao todo).</>}
                    {a.tipo === 'comecou' && <>Começou em <b>{a.comecouEm}</b> — {a.mesesDesdeInicioEmpresa} meses depois do início do histórico dessa empresa.</>}
                    {a.tipo === 'buraco' && <>Pagou até <b>{a.parouEm}</b>, ficou {a.mesesSemPagar} meses sem pagar, voltou em <b>{a.voltouEm}</b>.</>}
                  </td>
                  <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(a.mediaMensalQuandoAtivo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssistenteScreen() {
  const mensagens = [
    { de: 'voce', texto: 'Quais colaboradores excederam o limite de dobras em maio?' },
    { de: 'ia', texto: 'Leandro Vinicius Pinheiro de Souza fez 15 dobras (limite CCT: 5) e não recebeu nada por isso — R$1.797,63 em risco. João Pedro Travassos Nascimento também excedeu, com 60,4h.' },
    { de: 'voce', texto: 'E o impacto financeiro total das exceções abertas hoje?' },
    { de: 'ia', texto: 'Somando os itens de alta confiança em aberto: R$4.312,00, concentrados em Vigia Noturno 12x36 (72%) e Piso Regional (18%). Quer o detalhamento por região?' },
  ];
  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageEyebrow}>Em construção</div><h1 style={s.pageTitle}>Assistente IA</h1></div>
        <span style={s.navBadge}>em breve</span>
      </div>
      <div style={s.panel}>
        <p style={{ fontSize: 13, color: BRAND.gray, lineHeight: 1.7, marginBottom: 18 }}>
          Pré-visualização de como vai funcionar: um chat dentro do próprio Confere GT respondendo
          perguntas sobre as exceções em aberto, sem precisar abrir planilha nenhuma. Por trás, chama a
          API da Anthropic através de uma function do Firebase — a chave nunca fica exposta no código do site.
        </p>
        <div style={s.chatWrap}>
          {mensagens.map((m, i) => (
            <div key={i} style={{ ...s.chatBubble, ...(m.de === 'voce' ? s.chatBubbleVoce : s.chatBubbleIa) }}>{m.texto}</div>
          ))}
        </div>
        <div style={s.chatInputRow}>
          <input style={s.chatInput} placeholder="Pergunte sobre qualquer exceção, cargo ou colaborador…" disabled />
          <button style={{ ...s.btnPrimary, opacity: 0.5 }} disabled>Enviar</button>
        </div>
      </div>
    </div>
  );
}

function UsuariosScreen() {
  const usuarios = [
    { nome: 'Gabriel', papel: 'CEO · Administrador', ultimoAcesso: 'hoje, 09:12' },
    { nome: 'Juliana', papel: 'Administrativo · Administrador', ultimoAcesso: 'hoje, 08:47' },
    { nome: 'Shay', papel: 'Operações · Administrador', ultimoAcesso: 'ontem, 17:30' },
  ];
  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageEyebrow}>Acesso</div><h1 style={s.pageTitle}>Usuários</h1></div>
        <button style={s.btnPrimary}>+ Novo usuário</button>
      </div>
      <div style={s.panel}>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Usuário</th><th style={s.th}>Papel</th><th style={s.th}>Último acesso</th><th style={s.th}>Status</th></tr></thead>
          <tbody>
            {usuarios.map((a) => (
              <tr key={a.nome} style={s.tr}>
                <td style={s.td}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={s.avatarSm}>{a.nome[0]}</div>{a.nome}</div></td>
                <td style={s.td}>{a.papel}</td>
                <td style={{ ...s.td, color: BRAND.gray }}>{a.ultimoAcesso}</td>
                <td style={s.td}><span style={{ ...s.statusChip, color: BRAND.deep, borderColor: BRAND.deep }}>Ativo</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  loginWrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #EAF6F7 0%, #F5F8FA 45%, #EFF7F5 100%)', fontFamily: 'Inter, sans-serif' },
  loginCard: { width: 380, padding: '38px 34px', background: '#FFFFFF', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,80,110,0.10)', border: '1px solid #E4EEF0', textAlign: 'center' },
  loginEyebrow: { fontSize: 10, letterSpacing: '0.12em', color: BRAND.deep, fontWeight: 700, marginTop: 14, marginBottom: 8 },
  loginTitle: { fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 30, color: '#132430', margin: '0 0 6px' },
  loginSub: { fontSize: 13, color: '#6C7A85', margin: '0 0 26px', lineHeight: 1.5 },
  label: { display: 'block', textAlign: 'left', fontSize: 12, color: '#4C5A66', marginBottom: 6, fontWeight: 600 },
  inputText: { width: '100%', boxSizing: 'border-box', background: '#F5F8FA', border: '1px solid #DCE5E9', borderRadius: 8, padding: '11px 14px', color: '#132430', fontSize: 14, outline: 'none' },
  input: { width: '100%', boxSizing: 'border-box', background: '#F5F8FA', border: '1px solid #DCE5E9', borderRadius: 8, padding: '12px 14px', color: '#132430', fontSize: 20, letterSpacing: '0.3em', textAlign: 'center', outline: 'none', fontFamily: 'IBM Plex Mono, monospace' },
  errorText: { color: '#D64545', fontSize: 12, marginTop: 8, textAlign: 'left' },
  firstAccessBadge: { display: 'inline-block', fontSize: 11, fontWeight: 700, color: BRAND.deep, background: '#E4F6F8', padding: '5px 12px', borderRadius: 20, marginBottom: 4 },
  btnPrimary: { marginTop: 18, background: BRAND.deep, color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' },
  btnSecondary: { background: '#FFFFFF', color: BRAND.deep, border: `1.5px solid ${BRAND.deep}`, borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnGhost: { background: 'transparent', border: '1px solid #D6E1E5', color: '#4C5A66', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' },
  loginHint: { marginTop: 14, fontSize: 11.5, color: '#8493A0', lineHeight: 1.5 },
  loginFoot: { marginTop: 20, fontSize: 11, color: '#A9B3BE' },

  app: { display: 'flex', minHeight: '100vh', background: '#F5F8FA', fontFamily: 'Inter, sans-serif', color: '#1A2B38' },
  sidebar: { width: 236, background: '#FFFFFF', borderRight: '1px solid #E7ECF0', display: 'flex', flexDirection: 'column', padding: '20px 14px', flexShrink: 0 },
  sidebarBrand: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' },
  sidebarBrandTitle: { fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 16.5, color: '#132430' },
  sidebarBrandSub: { fontSize: 10, color: BRAND.gray, letterSpacing: '0.1em' },
  navItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#4C5A66', padding: '10px 12px', borderRadius: 7, fontSize: 13.5, cursor: 'pointer', marginBottom: 2, fontFamily: 'Inter, sans-serif' },
  navItemActive: { background: '#E4F6F8', color: BRAND.deep, fontWeight: 700 },
  navBadge: { fontSize: 9, background: '#E4F6F8', color: BRAND.deep, padding: '2px 6px', borderRadius: 10, fontWeight: 700 },
  sidebarUser: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderTop: '1px solid #E7ECF0' },
  avatar: { width: 30, height: 30, borderRadius: '50%', background: BRAND.mint, color: BRAND.deep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  avatarSm: { width: 26, height: 26, borderRadius: '50%', background: BRAND.mint, color: BRAND.deep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11.5, flexShrink: 0 },
  linkBtn: { background: 'transparent', border: 'none', color: BRAND.gray, cursor: 'pointer', fontSize: 16 },

  main: { flex: 1, padding: '26px 34px', overflowY: 'auto' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  pageEyebrow: { fontSize: 11, letterSpacing: '0.1em', color: BRAND.deep, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' },
  pageTitle: { fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 25, margin: 0, color: '#132430' },
  compSwitch: { display: 'flex', gap: 4, background: '#EEF3F5', padding: 4, borderRadius: 8 },
  compBtn: { background: 'transparent', border: 'none', color: BRAND.gray, padding: '6px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace' },
  compBtnActive: { background: '#FFFFFF', color: BRAND.deep, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },

  statusBanner: (status) => ({
    padding: '11px 16px', borderRadius: 8, fontSize: 13, marginBottom: 18,
    background: status === 'fechada' ? '#E4F6F8' : '#FDEDED',
    color: status === 'fechada' ? '#00838A' : '#B23A3A',
    border: `1px solid ${status === 'fechada' ? '#BFE8EA' : '#F3CACA'}`,
  }),

  hexRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 },
  hexKpi: { background: '#FFFFFF', border: '1px solid #E7ECF0', borderRadius: 12, padding: '16px 18px', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,50,60,0.04)' },
  hexKpiGlyph: { position: 'absolute', top: -10, right: -10, opacity: 0.35 },
  hexKpiLabel: { fontSize: 11.5, color: BRAND.gray, marginBottom: 8 },
  hexKpiValue: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 21, fontWeight: 700 },
  hexKpiSub: { fontSize: 11, color: '#9AA6AF', marginTop: 4 },

  grid2: { display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18 },
  panel: { background: '#FFFFFF', border: '1px solid #E7ECF0', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 3px rgba(20,50,60,0.04)' },
  panelTitle: { fontSize: 13.5, fontWeight: 700, marginBottom: 16, color: '#132430', fontFamily: 'Sora, sans-serif' },

  severityWrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  severityRow: { display: 'grid', gridTemplateColumns: '1fr 130px 60px', alignItems: 'center', gap: 12 },
  severityLabel: { fontSize: 12.5, color: '#1A2B38', fontWeight: 600 },
  severitySub: { fontSize: 10.5, color: '#9AA6AF', marginTop: 1 },
  severityTrack: { position: 'relative', height: 8, background: '#EEF3F5', borderRadius: 4, overflow: 'hidden' },
  severityFillTotal: { position: 'absolute', inset: 0, background: '#D6E1E5', borderRadius: 4 },
  severityFillAlta: { position: 'absolute', top: 0, bottom: 0, left: 0, background: '#D64545', borderRadius: 4 },
  severityCount: { fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', textAlign: 'right' },

  regionRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0F3F5' },
  activityRow: { display: 'flex', gap: 12, padding: '9px 0' },
  activityDot: { width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0 },
  activityText: { fontSize: 12.5, lineHeight: 1.5, color: '#334552' },
  activityWhen: { fontSize: 10.5, color: '#9AA6AF', marginTop: 2 },

  uploadRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '13px 4px', borderBottom: '1px solid #EEF3F5' },
  uploadCheck: { width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #D6E1E5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: BRAND.gray, flexShrink: 0 },
  uploadCheckDone: { background: BRAND.teal, border: 'none', color: '#FFFFFF' },
  checklistRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0' },
  fileDrop: { position: 'relative', border: '1.5px dashed #C7D6DC', borderRadius: 10, padding: '22px 16px', textAlign: 'center', background: '#F5F8FA' },
  fileInput: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' },
  resultBox: { marginTop: 20, background: '#E4F6F8', border: '1px solid #BFE8EA', borderRadius: 10, padding: '16px 18px' },
  resultRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', color: '#134450' },

  pillRow: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  pill: { background: '#FFFFFF', border: '1px solid #DCE5E9', color: '#4C5A66', padding: '7px 14px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer' },
  pillActive: { background: BRAND.deep, borderColor: BRAND.deep, color: '#FFFFFF', fontWeight: 700 },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 11, letterSpacing: '0.04em', color: '#9AA6AF', padding: '0 10px 12px', fontWeight: 700, textTransform: 'uppercase' },
  tr: { borderTop: '1px solid #EEF3F5' },
  td: { padding: '13px 10px', fontSize: 13, color: '#334552', verticalAlign: 'top' },
  tierTag: { fontSize: 10.5, background: '#E4F6F8', color: '#00838A', padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap', marginRight: 4 },
  statusChip: { fontSize: 11, border: '1px solid', padding: '3px 9px', borderRadius: 20 },

  drawerOverlay: { position: 'fixed', inset: 0, background: 'rgba(20,40,50,0.25)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 },
  drawer: { width: 440, height: '100%', background: '#FFFFFF', borderLeft: '1px solid #E7ECF0', padding: '26px 28px', overflowY: 'auto' },
  drawerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  drawerMeta: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  drawerLabel: { fontSize: 11, color: '#9AA6AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 700 },
  textarea: { width: '100%', boxSizing: 'border-box', minHeight: 80, background: '#F5F8FA', border: '1px solid #DCE5E9', borderRadius: 8, padding: 12, color: '#1A2B38', fontSize: 13, fontFamily: 'Inter, sans-serif', resize: 'vertical', marginTop: 8 },

  chatWrap: { display: 'flex', flexDirection: 'column', gap: 10, background: '#F5F8FA', borderRadius: 10, padding: 18, marginBottom: 14 },
  chatBubble: { maxWidth: '75%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5 },
  chatBubbleVoce: { alignSelf: 'flex-end', background: BRAND.deep, color: '#FFFFFF' },
  chatBubbleIa: { alignSelf: 'flex-start', background: '#FFFFFF', color: '#334552', border: '1px solid #E7ECF0' },
  chatInputRow: { display: 'flex', gap: 10 },
  chatInput: { flex: 1, background: '#F5F8FA', border: '1px solid #DCE5E9', borderRadius: 8, padding: '11px 14px', color: '#1A2B38', fontSize: 13 },
};

function EmpresaSwitcher({ numEmp, setNumEmp }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
      {EMPRESAS.map((emp) => (
        <button key={emp.numEmp} onClick={() => setNumEmp(emp.numEmp)}
          style={{
            ...s.compBtn, ...(numEmp === emp.numEmp ? s.compBtnActive : {}),
            opacity: emp.ativa ? 1 : 0.55, border: '1px solid #DCE5E9', padding: '7px 14px',
          }}>
          {emp.nome}{!emp.ativa && ' (inativa)'}
        </button>
      ))}
    </div>
  );
}

export default function ConfereGT() {
  const [user, setUser] = useState(null);
  const [tela, setTela] = useState('dashboard');
  const [competencia, setCompetencia] = useState('06/2026');
  const [numEmp, setNumEmp] = useState(30); // RG Serviços — a maior, abre por padrão

  return (
    <>
      <link rel="stylesheet" href={FONT_LINK} />
      {!user ? <LoginScreen onLogin={setUser} /> : (
        <div style={s.app}>
          <Sidebar user={user.nome} tela={tela} setTela={setTela} onLogout={() => setUser(null)} />
          <div style={s.main}>
            <EmpresaSwitcher numEmp={numEmp} setNumEmp={setNumEmp} />
            {tela === 'dashboard' && <Dashboard competencia={competencia} setCompetencia={setCompetencia} user={user} numEmp={numEmp} />}
            {tela === 'upload' && <UploadScreen user={user} numEmp={numEmp} />}
            {tela === 'excecoes' && <ExcecoesScreen numEmp={numEmp} />}
            {tela === 'chefias' && <ChefiasScreen numEmp={numEmp} />}
            {tela === 'analiseHistorica' && <AnaliseHistoricaScreen numEmp={numEmp} />}
            {tela === 'historico' && <HistoricoScreen user={user} numEmp={numEmp} />}
            {tela === 'assistente' && <AssistenteScreen />}
            {tela === 'usuarios' && <UsuariosScreen />}
          </div>
        </div>
      )}
    </>
  );
}

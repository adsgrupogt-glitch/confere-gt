import React, { useState, useMemo, useEffect } from 'react';
import { login as fbLogin, trocarSenha as fbTrocarSenha, garantirUsuariosSeed } from './auth';
import { extrairTextoLayout } from './pdf-texto';
import { parseFolha } from './parser-folha';
import { tier1Legal } from './regras-tier1';
import { salvarResumoCompetencia, salvarExcecoes, registrarAtividade } from './dados';

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

const REGIOES = [
  { nome: 'São José', colaboradores: 495, cct: 'SC000102/2026', excecoes: 62 },
  { nome: 'Florianópolis', colaboradores: 360, cct: 'SC000124/2026', excecoes: 41 },
  { nome: 'Itajaí', colaboradores: 40, cct: 'SC000101/2026', excecoes: 3 },
  { nome: 'Vigia (estadual)', colaboradores: 179, cct: 'SC000253/2026', excecoes: 158 },
];

const TIER_META = {
  t1: { label: 'INSS / FGTS / VT', desc: 'Regra federal — tabela progressiva 2026, FGTS 8%, teto VT 6%' },
  t1c: { label: 'Periculosidade & Insalubridade', desc: 'CCT Asseio — 30% / 20% / 40% sobre o salário base' },
  t1d: { label: 'CCT Vigia', desc: 'Piso R$2.020,33 + proibição de periculosidade' },
  t1e: { label: 'Piso Regional', desc: 'São José · Florianópolis · Itajaí' },
  t2: { label: 'Consistência de Pares', desc: 'Desvio estatístico dentro do mesmo cargo' },
  t5: { label: 'Horas Extras', desc: 'Cruzamento ponto × folha, exclui banco de horas confirmado' },
  t6: { label: 'Dobras 12x36', desc: 'Limite de 5 dobras/mês — Cláusula 35ª §7º' },
};

const COMPETENCIAS = {
  '04/2026': { status: 'fechada', colaboradores: 884, proventos: 1975400.30, liquido: 1324828.63,
    tiers: { t1: 143, t1c: 6, t1d: 0, t2: 94, t5: 2, t6: 1 },
    alta: { t1: 0, t1c: 6, t1d: 0, t2: 0, t5: 2, t6: 1 } },
  '05/2026': { status: 'fechada', colaboradores: 870, proventos: 1924123.11, liquido: 1377414.55,
    tiers: { t1: 100, t1c: 86, t1d: 1, t2: 66, t5: 5, t6: 1 },
    alta: { t1: 0, t1c: 0, t1d: 1, t2: 0, t5: 3, t6: 1 } },
  '06/2026': { status: 'em_conferencia', colaboradores: 870, proventos: 1900160.46, liquido: 1437532.64,
    tiers: { t1: 261, t1c: 5, t1d: 0, t1e: 1, t2: 85, t5: 4, t6: 2 },
    alta: { t1: 156, t1c: 0, t1d: 0, t1e: 1, t2: 0, t5: 2, t6: 2 } },
};

const CARGOS_TOP = [
  { cargo: 'Vigia Noturno 12x36', ocorrencias: 152, colaboradores: 133, camadaPrincipal: 'INSS/FGTS' },
  { cargo: 'Porteiro Noturno 12x36', ocorrencias: 34, colaboradores: 150, camadaPrincipal: 'Dobras' },
  { cargo: 'ASG 44hs', ocorrencias: 28, colaboradores: 656, camadaPrincipal: 'Consistência' },
  { cargo: 'Zelador 44hs', ocorrencias: 19, colaboradores: 499, camadaPrincipal: 'Periculosidade' },
  { cargo: 'Encarregado Nível 01', ocorrencias: 4, colaboradores: 10, camadaPrincipal: 'Horas Extras' },
];

const EXCECOES = [
  { matricula: '310002797', nome: 'Valdemir Hercilio Miguel', cargo: 'Vigia Noturno 12x36', regiao: 'Vigia (estadual)', tier: 't1', regra: 'INSS/FGTS abaixo do esperado sobre a base declarada', esperado: 166.01, lancado: 156.13, confianca: 'alta', status: 'aguardando_rh' },
  { matricula: '310001624', nome: 'Leandro Goncalves Nascimento', cargo: 'Porteiro Noturno 12x36', regiao: 'São José', tier: 't1', regra: 'INSS/FGTS abaixo do esperado sobre a base declarada', esperado: 226.25, lancado: 219.99, confianca: 'alta', status: 'aguardando_rh' },
  { matricula: '310002875', nome: 'Carlos Roberto Nogueira da Silva', cargo: 'ASG 12x36', regiao: 'São José', tier: 't5', regra: '120h de Falta e 120h de Hora Extra no mesmo mês', esperado: null, lancado: null, confianca: 'revisar', status: 'em_correcao' },
  { matricula: '310001187', nome: 'Leandro Vinicius Pinheiro de Souza', cargo: 'Vigia Noturno 12x36', regiao: 'Florianópolis', tier: 't6', regra: '15 dobras no mês — limite CCT é 5', esperado: 1797.63, lancado: 0, confianca: 'alta', status: 'aguardando_rh' },
  { matricula: '310002345', nome: 'Fabiana Dias de Oliveira', cargo: 'ASG 44hs - Vip', regiao: 'São José', tier: 't1e', regra: 'Salário base abaixo do piso regional', esperado: 1752.85, lancado: 1604.12, confianca: 'alta', status: 'revisar' },
  { matricula: '310001646', nome: 'Michele C. Rodrigues Peres Soares', cargo: 'Encarregado Nível 01', regiao: 'São José', tier: 't5', regra: 'Hora extra trabalhada e não paga — sem banco de horas', esperado: 9.0, lancado: 0, confianca: 'alta', status: 'revisar' },
  { matricula: '310000487', nome: 'Fabio Dirceu Piveta', cargo: 'Zelador 44hs', regiao: 'São José', tier: 't1c', regra: 'Periculosidade em férias validada — gabarito confirmado', esperado: 395.55, lancado: 395.55, confianca: 'ok', status: 'ok' },
];

const ATIVIDADE = [
  { quando: '02/07 · 20:41', texto: 'RH confirmou: evento 2635 deve somar de volta à base de INSS/FGTS — taxa de acerto subiu de 40% para 90,5%', tipo: 'resolvido' },
  { quando: '02/07 · 18:22', texto: 'CCT Florianópolis registrada oficialmente no Mediador — SC000124/2026', tipo: 'info' },
  { quando: '02/07 · 15:10', texto: 'Piso de Itajaí confirmado menor que São José/Floripa — regra regional criada', tipo: 'info' },
  { quando: '02/07 · 14:05', texto: 'Achado crítico: Leandro Vinicius com 15 dobras no mês (limite CCT: 5) e zero pago', tipo: 'alerta' },
  { quando: '01/07 · 09:30', texto: 'Folha 06/2026 recalculada recebida — reprocessamento completo em andamento', tipo: 'info' },
];

const fmtBRL = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v) => v.toLocaleString('pt-BR');

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
    { id: 'upload', label: 'Nova Conferência' },
    { id: 'excecoes', label: 'Exceções' },
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
  return (
    <div style={s.panel}>
      <div style={s.panelTitle}>Linha do tempo da auditoria</div>
      <div>
        {ATIVIDADE.map((a, i) => (
          <div key={i} style={s.activityRow}>
            <div style={{ ...s.activityDot, background: dot[a.tipo] }} />
            <div style={{ flex: 1 }}>
              <div style={s.activityText}>{a.texto}</div>
              <div style={s.activityWhen}>{a.quando}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ competencia, setCompetencia }) {
  const d = COMPETENCIAS[competencia];
  const totalExcecoes = Object.values(d.tiers).reduce((x, y) => x + y, 0);
  const totalAlta = Object.values(d.alta).reduce((x, y) => x + y, 0);
  const taxaConferido = (((d.colaboradores - totalAlta) / d.colaboradores) * 100).toFixed(1);

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageEyebrow}>Painel de Conferência</div>
          <h1 style={s.pageTitle}>Competência {competencia}</h1>
        </div>
        <div style={s.compSwitch}>
          {Object.keys(COMPETENCIAS).map((c) => (
            <button key={c} onClick={() => setCompetencia(c)} style={{ ...s.compBtn, ...(c === competencia ? s.compBtnActive : {}) }}>{c}</button>
          ))}
        </div>
      </div>

      <div style={s.statusBanner(d.status)}>
        {d.status === 'fechada'
          ? '✓ Folha conferida e fechada — integra o histórico oficial.'
          : `⚑ Em conferência — ${totalAlta} exceções de alta confiança aguardando revisão. ${taxaConferido}% da folha já validada sem ressalvas.`}
      </div>

      <div style={s.hexRow}>
        <HexKpi label="Colaboradores" value={fmtNum(d.colaboradores)} sub={`${REGIOES.length} regiões/CCTs`} />
        <HexKpi label="Proventos" value={fmtBRL(d.proventos)} />
        <HexKpi label="Líquido Total" value={fmtBRL(d.liquido)} tone="good" />
        <HexKpi label="Exceções Abertas" value={fmtNum(totalExcecoes)} sub={`${totalAlta} de alta confiança`} tone={totalAlta > 0 ? 'danger' : 'good'} />
      </div>

      <div style={s.grid2}>
        <div style={s.panel}>
          <div style={s.panelTitle}>Exceções por camada de verificação</div>
          <SeverityPanel tiers={d.tiers} alta={d.alta} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={s.panel}>
            <div style={s.panelTitle}>Cobertura por região / CCT</div>
            {REGIOES.map((r) => (
              <div key={r.nome} style={s.regionRow}>
                <Hex size={20} fill={BRAND.teal} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.nome}</div>
                  <div style={{ fontSize: 11, color: BRAND.gray, fontFamily: 'IBM Plex Mono, monospace' }}>{r.cct}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono, monospace' }}>{r.colaboradores}</div>
                  <div style={{ fontSize: 11, color: r.excecoes > 50 ? '#D64545' : BRAND.gray }}>{r.excecoes} exceções</div>
                </div>
              </div>
            ))}
          </div>
          <ActivityFeed />
        </div>
      </div>

      <div style={{ ...s.panel, marginTop: 18 }}>
        <div style={s.panelTitle}>Cargos com mais ocorrências no mês</div>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Cargo</th><th style={s.th}>Colaboradores</th><th style={s.th}>Ocorrências</th><th style={s.th}>Camada principal</th></tr></thead>
          <tbody>
            {CARGOS_TOP.map((c) => (
              <tr key={c.cargo} style={s.tr}>
                <td style={s.td}>{c.cargo}</td>
                <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{c.colaboradores}</td>
                <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace', color: c.ocorrencias > 50 ? '#D64545' : '#33414D' }}>{c.ocorrencias}</td>
                <td style={s.td}><span style={s.tierTag}>{c.camadaPrincipal}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadScreen() {
  const [competencia, setCompetencia] = useState('07/2026');
  const [arquivo, setArquivo] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | lendo | analisando | concluido | erro
  const [progresso, setProgresso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  const rodarConferencia = async () => {
    if (!arquivo) return;
    setStatus('lendo'); setErro(''); setResultado(null);
    try {
      const buffer = await arquivo.arrayBuffer();
      const texto = await extrairTextoLayout(buffer, (p, total) => setProgresso({ p, total }));

      setStatus('analisando');
      const colaboradores = parseFolha(texto);
      if (colaboradores.length === 0) throw new Error('Não consegui reconhecer nenhum colaborador neste PDF — confirma se é a Relação de Cálculo do Senior/Rubi.');

      const [mesStr, anoStr] = competencia.split('/');
      const periodoInicio = new Date(parseInt(anoStr, 10), parseInt(mesStr, 10) - 1, 1);
      const excecoesT1 = tier1Legal(colaboradores, periodoInicio, competencia);
      const alta = excecoesT1.filter((x) => x.confianca === 'alta').length;

      const proventos = colaboradores.reduce((s, e) => s + (e.totais.proventos || 0), 0);
      const descontos = colaboradores.reduce((s, e) => s + (e.totais.descontos || 0), 0);
      const liquido = colaboradores.reduce((s, e) => s + (e.totais.liquido || 0), 0);

      await salvarResumoCompetencia(competencia, {
        status: 'em_conferencia', colaboradores: colaboradores.length, proventos, descontos, liquido,
      });
      await salvarExcecoes(competencia, 't1', excecoesT1);
      await registrarAtividade(
        `Conferência de ${competencia} rodada: ${colaboradores.length} colaboradores, ${excecoesT1.length} exceções em INSS/FGTS/VT (${alta} de alta confiança).`,
        alta > 0 ? 'alerta' : 'resolvido'
      );

      setResultado({ colaboradores: colaboradores.length, proventos, liquido, excecoes: excecoesT1.length, alta });
      setStatus('concluido');
    } catch (e) {
      setErro(e.message || 'Algo deu errado ao processar o PDF.');
      setStatus('erro');
    }
  };

  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Nova Conferência</div><h1 style={s.pageTitle}>Subir folha de pagamento</h1></div></div>

      <div style={s.grid2}>
        <div style={s.panel}>
          <label style={s.label}>Competência</label>
          <input style={{ ...s.inputText, marginBottom: 16 }} value={competencia}
            onChange={(e) => setCompetencia(e.target.value)} placeholder="07/2026" />

          <label style={s.label}>Relação de Cálculo (PDF do Senior/Rubi)</label>
          <div style={s.fileDrop}>
            <input type="file" accept="application/pdf" style={s.fileInput}
              onChange={(e) => setArquivo(e.target.files[0] || null)} />
            <div style={{ fontSize: 13, color: arquivo ? '#1A2B38' : BRAND.gray, fontWeight: arquivo ? 600 : 400 }}>
              {arquivo ? `📄 ${arquivo.name}` : 'Clique ou arraste o PDF aqui'}
            </div>
          </div>

          <button style={{ ...s.btnPrimary, marginTop: 20 }} onClick={rodarConferencia}
            disabled={!arquivo || status === 'lendo' || status === 'analisando'}>
            {status === 'lendo' ? `Lendo PDF${progresso ? ` (página ${progresso.p}/${progresso.total})` : ''}…`
              : status === 'analisando' ? 'Rodando conferência…'
              : 'Rodar conferência'}
          </button>

          {status === 'erro' && <div style={{ ...s.errorText, marginTop: 12 }}>{erro}</div>}

          {status === 'concluido' && resultado && (
            <div style={s.resultBox}>
              <div style={{ fontWeight: 700, color: BRAND.deep, marginBottom: 10 }}>✓ Conferência concluída</div>
              <div style={s.resultRow}><span>Colaboradores processados</span><b>{fmtNum(resultado.colaboradores)}</b></div>
              <div style={s.resultRow}><span>Proventos</span><b>{fmtBRL(resultado.proventos)}</b></div>
              <div style={s.resultRow}><span>Líquido</span><b>{fmtBRL(resultado.liquido)}</b></div>
              <div style={s.resultRow}><span>Exceções (INSS/FGTS/VT)</span><b style={{ color: resultado.alta > 0 ? '#D64545' : BRAND.deep }}>{resultado.excecoes} ({resultado.alta} de alta confiança)</b></div>
              <div style={{ fontSize: 11.5, color: BRAND.gray, marginTop: 10, lineHeight: 1.5 }}>
                Salvo no Firebase em <code>folhas/{competencia.replace('/', '-')}</code>. Consulte a aba Exceções para o detalhe linha a linha.
              </div>
            </div>
          )}
        </div>

        <div style={s.panel}>
          <div style={s.panelTitle}>O que já roda de verdade</div>
          <div style={s.checklistRow}>
            <Hex size={16} fill={BRAND.teal} />
            <div><div style={{ fontSize: 13, fontWeight: 600 }}>{TIER_META.t1.label}</div><div style={{ fontSize: 11.5, color: BRAND.gray }}>{TIER_META.t1.desc} — ativo, rodando no seu navegador</div></div>
          </div>
          {Object.entries(TIER_META).filter(([k]) => k !== 't1').map(([k, t]) => (
            <div key={k} style={{ ...s.checklistRow, opacity: 0.5 }}>
              <Hex size={16} fill="none" stroke={BRAND.gray} strokeWidth={4} />
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div><div style={{ fontSize: 11.5, color: BRAND.gray }}>{t.desc} — em portagem, ainda roda só no motor Python</div></div>
            </div>
          ))}
          <p style={{ fontSize: 12, color: BRAND.gray, marginTop: 16, lineHeight: 1.6 }}>
            O PDF é lido inteiramente no seu navegador — nada é enviado a nenhum servidor externo
            além do próprio Firebase do Grupo GT. Nada aqui substitui o Senior; o Confere GT só confere.
          </p>
        </div>
      </div>
    </div>
  );
}

function DetalheExcecao({ item, onClose }) {
  if (!item) return null;
  return (
    <div style={s.drawerOverlay} onClick={onClose}>
      <div style={s.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={s.drawerHeader}>
          <div><div style={s.pageEyebrow}>{item.matricula}</div><h2 style={{ ...s.pageTitle, fontSize: 20 }}>{item.nome}</h2></div>
          <button style={s.linkBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.drawerMeta}>
          <span style={s.tierTag}>{TIER_META[item.tier].label}</span>
          <span style={s.tierTag}>{item.regiao}</span>
          <span style={s.tierTag}>{item.cargo}</span>
        </div>
        <div>
          <div style={s.drawerLabel}>Regra aplicada</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>{item.regra}</div>
        </div>
        {item.esperado != null && (
          <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
            <div>
              <div style={s.drawerLabel}>Esperado</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17 }}>
                {typeof item.esperado === 'number' && item.esperado < 100 && item.esperado > 0 && item.tier !== 't1e' ? item.esperado.toFixed(2) + 'h' : fmtBRL(item.esperado)}
              </div>
            </div>
            <div>
              <div style={s.drawerLabel}>Lançado</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 17, color: '#D64545' }}>
                {typeof item.lancado === 'number' && item.lancado < 100 && item.tier !== 't1e' ? item.lancado.toFixed(2) + 'h' : fmtBRL(item.lancado)}
              </div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 22, borderTop: '1px solid #E7ECF0', paddingTop: 18 }}>
          <div style={s.drawerLabel}>Parecer / observação</div>
          <textarea style={s.textarea} placeholder="Registrar decisão do RH sobre este item…" />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button style={s.btnPrimary}>Marcar como resolvido</button>
            <button style={s.btnGhost}>Encaminhar ao RH</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExcecoesScreen() {
  const [tierAtivo, setTierAtivo] = useState('todos');
  const [selecionado, setSelecionado] = useState(null);
  const lista = useMemo(() => EXCECOES.filter((e) => tierAtivo === 'todos' || e.tier === tierAtivo), [tierAtivo]);
  const statusChip = { revisar: ['A revisar', BRAND.gray], em_correcao: ['Em correção', BRAND.blue], aguardando_rh: ['Aguardando RH', '#D64545'], ok: ['Resolvido', BRAND.teal] };

  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Competência 06/2026</div><h1 style={s.pageTitle}>Exceções</h1></div></div>
      <div style={s.pillRow}>
        <button onClick={() => setTierAtivo('todos')} style={{ ...s.pill, ...(tierAtivo === 'todos' ? s.pillActive : {}) }}>Todas ({EXCECOES.length})</button>
        {Object.entries(TIER_META).map(([k, v]) => {
          const n = EXCECOES.filter((e) => e.tier === k).length;
          if (!n) return null;
          return <button key={k} onClick={() => setTierAtivo(k)} style={{ ...s.pill, ...(tierAtivo === k ? s.pillActive : {}) }}>{v.label} ({n})</button>;
        })}
      </div>
      <div style={s.panel}>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Colaborador</th><th style={s.th}>Cargo / Região</th><th style={s.th}>Regra</th><th style={s.th}>Status</th></tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.matricula + e.tier} style={{ ...s.tr, cursor: 'pointer' }} onClick={() => setSelecionado(e)}>
                <td style={s.td}>
                  <div style={{ fontWeight: 600 }}>{e.nome}</div>
                  <div style={{ fontSize: 11, color: BRAND.gray, fontFamily: 'IBM Plex Mono, monospace' }}>{e.matricula}</div>
                </td>
                <td style={s.td}><div>{e.cargo}</div><div style={{ fontSize: 11, color: BRAND.gray }}>{e.regiao}</div></td>
                <td style={{ ...s.td, maxWidth: 340 }}>{e.regra}</td>
                <td style={s.td}><span style={{ ...s.statusChip, color: statusChip[e.status][1], borderColor: statusChip[e.status][1] }}>{statusChip[e.status][0]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DetalheExcecao item={selecionado} onClose={() => setSelecionado(null)} />
    </div>
  );
}

function HistoricoScreen() {
  const meses = Object.keys(COMPETENCIAS);
  const max = Math.max(...meses.map((m) => COMPETENCIAS[m].liquido));
  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageEyebrow}>Série Mensal</div><h1 style={s.pageTitle}>Histórico & KPIs</h1></div></div>
      <div style={s.grid2}>
        <div style={s.panel}>
          <div style={s.panelTitle}>Líquido pago por competência</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, height: 170, padding: '16px 4px 0' }}>
            {meses.map((m) => (
              <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: BRAND.gray }}>{(COMPETENCIAS[m].liquido / 1e6).toFixed(2)}M</div>
                <div style={{ width: '58%', borderRadius: '4px 4px 0 0', height: `${(COMPETENCIAS[m].liquido / max) * 120}px`, background: `linear-gradient(180deg, ${BRAND.teal}, ${BRAND.deep})` }} />
                <div style={{ fontSize: 12, color: '#5B6773' }}>{m}</div>
              </div>
            ))}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.4 }}>
              <div style={{ width: '58%', height: 34, border: '1.5px dashed #C7D0D8', borderRadius: 4 }} />
              <div style={{ fontSize: 12, color: BRAND.gray }}>07/2026</div>
            </div>
          </div>
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>Taxa de exceção de alta confiança</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, height: 170, padding: '16px 4px 0' }}>
            {meses.map((m) => {
              const d = COMPETENCIAS[m];
              const alta = Object.values(d.alta).reduce((a, b) => a + b, 0);
              const pct = (alta / d.colaboradores) * 100;
              return (
                <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: pct > 5 ? '#D64545' : BRAND.gray }}>{pct.toFixed(1)}%</div>
                  <div style={{ width: '58%', borderRadius: '4px 4px 0 0', height: `${Math.max(pct * 8, 4)}px`, background: pct > 5 ? '#D64545' : BRAND.blue }} />
                  <div style={{ fontSize: 12, color: '#5B6773' }}>{m}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ ...s.panel, marginTop: 18 }}>
        <div style={s.panelTitle}>Evolução mês a mês</div>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Competência</th><th style={s.th}>Colaboradores</th><th style={s.th}>Proventos</th><th style={s.th}>Líquido</th><th style={s.th}>Status</th></tr></thead>
          <tbody>
            {meses.map((m) => {
              const d = COMPETENCIAS[m];
              return (
                <tr key={m} style={s.tr}>
                  <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{m}</td>
                  <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtNum(d.colaboradores)}</td>
                  <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(d.proventos)}</td>
                  <td style={{ ...s.td, fontFamily: 'IBM Plex Mono, monospace' }}>{fmtBRL(d.liquido)}</td>
                  <td style={s.td}>
                    <span style={{ ...s.statusChip, color: d.status === 'fechada' ? BRAND.deep : '#D64545', borderColor: d.status === 'fechada' ? BRAND.deep : '#D64545' }}>
                      {d.status === 'fechada' ? 'Fechada' : 'Em conferência'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: BRAND.gray, marginTop: 14 }}>
          Subindo 01, 02 e 03/2026 já fechadas, essa série cobre o semestre inteiro e passa a mostrar
          sazonalidade, tendência de custo por região e evolução da taxa de exceção com mais robustez estatística.
        </p>
      </div>
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

export default function ConfereGT() {
  const [user, setUser] = useState(null);
  const [tela, setTela] = useState('dashboard');
  const [competencia, setCompetencia] = useState('06/2026');

  return (
    <>
      <link rel="stylesheet" href={FONT_LINK} />
      {!user ? <LoginScreen onLogin={setUser} /> : (
        <div style={s.app}>
          <Sidebar user={user.nome} tela={tela} setTela={setTela} onLogout={() => setUser(null)} />
          <div style={s.main}>
            {tela === 'dashboard' && <Dashboard competencia={competencia} setCompetencia={setCompetencia} />}
            {tela === 'upload' && <UploadScreen />}
            {tela === 'excecoes' && <ExcecoesScreen />}
            {tela === 'historico' && <HistoricoScreen />}
            {tela === 'assistente' && <AssistenteScreen />}
            {tela === 'usuarios' && <UsuariosScreen />}
          </div>
        </div>
      )}
    </>
  );
}

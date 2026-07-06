// server.js — Confere GT Backend (ponte entre o Vetorh/Rubi e o Confere GT)
//
// O QUE ISSO FAZ: roda dentro (ou perto) da rede do Grupo GT, com acesso ao
// SQL Server do Vetorh. Expõe só um punhado de endpoints REST, somente
// leitura. O Confere GT (o app no navegador) fala só com este servidor —
// NUNCA direto com o banco. A credencial do banco vive só aqui, no .env
// deste servidor, e nunca em código, chat ou repositório do Confere GT.
//
// FASE ATUAL: só testar conectividade. Nenhuma query de folha ainda —
// isso vem depois que soubermos o schema real (rodem discovery.sql e me
// mandem o resultado).

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
app.use(cors());
app.use(express.json());

// Autenticação simples do Confere GT -> este backend (chave própria deste
// backend, diferente da senha do banco). Troque no .env antes de publicar.
const API_KEY = process.env.CONFERE_GT_API_KEY;
app.use((req, res, next) => {
  if (req.path === '/api/ping') return next(); // health-check não exige chave
  const chave = req.header('x-api-key');
  if (!API_KEY || chave !== API_KEY) return res.status(401).json({ erro: 'Chave de API inválida ou ausente (header x-api-key).' });
  next();
});

// As 5 empresas do Grupo GT cadastradas no mesmo Vetorh (multi-empresa).
// GT Servi e GT Limp estão praticamente inativas — ainda aparecem na lista,
// mas o Dashboard Consolidado não precisa dar o mesmo destaque a elas.
const EMPRESAS = {
  10: { nome: 'GT Servi', ativa: false },
  20: { nome: 'GT Limp', ativa: false },
  30: { nome: 'RG Serviços', ativa: true },
  40: { nome: 'GT Vig', ativa: true },
  50: { nome: 'GT Cred', ativa: true },
};

app.get('/api/empresas', (req, res) => {
  const lista = Object.entries(EMPRESAS).map(([numEmp, info]) => ({ numEmp: Number(numEmp), ...info }));
  res.json({ ok: true, empresas: lista });
});

const dbConfig = {
  server: process.env.DB_SERVER,          // ex: SERVER-SENIOR (sem a instância aqui)
  database: process.env.DB_DATABASE,      // ex: Vetorh_Homolog
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    instanceName: process.env.DB_INSTANCE || undefined, // ex: SQLEXPRESS
    encrypt: true,                         // conexão criptografada
    trustServerCertificate: true,          // ok pra rede interna/VPN; revisar se expuser externamente
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

let pool;
async function getPool() {
  if (pool && pool.connected) return pool;
  pool = await sql.connect(dbConfig);
  return pool;
}

// Health-check simples — sempre responde, não toca no banco.
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, servico: 'Confere GT Backend', hora: new Date().toISOString() });
});

// Teste de conectividade real com o Vetorh — SÓ LEITURA, consulta mínima.
app.get('/api/testdb', async (req, res) => {
  try {
    const conn = await getPool();
    const resultado = await conn.request().query('SELECT TOP 1 NumEmp, TipCol, NumCad, NomFun FROM vetorh.R034FUN');
    res.json({ ok: true, mensagem: 'Conectado ao Vetorh com sucesso.', amostra: resultado.recordset });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// Lista as competências disponíveis no Vetorh pra uma empresa (só datas,
// nenhum dado de colaborador) — usado pelo Confere GT pra saber o que dá
// pra puxar. ?empresa=NumEmp é obrigatório (cada empresa pode ter um range
// de competências diferente, principalmente as inativas).
app.get('/api/competencias', async (req, res) => {
  const numEmp = Number(req.query.empresa);
  if (!EMPRESAS[numEmp]) return res.status(400).json({ ok: false, erro: 'Parâmetro ?empresa= obrigatório e deve ser um NumEmp válido. Veja /api/empresas.' });
  try {
    const conn = await getPool();
    const request = conn.request();
    request.input('numEmp', sql.SmallInt, numEmp);
    const resultado = await request.query('SELECT DISTINCT PerRef FROM vetorh.R044CAL WHERE NumEmp = @numEmp ORDER BY PerRef DESC');
    const competencias = resultado.recordset.map((r) => {
      const d = new Date(r.PerRef);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    });
    res.json({ ok: true, empresa: EMPRESAS[numEmp].nome, competencias });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// O endpoint principal: devolve a folha de uma competência inteira DE UMA
// EMPRESA ESPECÍFICA (?empresa=NumEmp obrigatório — sem isso, mistura
// colaboradores de empresas diferentes do Grupo GT, que é exatamente o
// bug que já pegamos uma vez). Formato de saída igual ao que parseFolha()
// produz a partir do PDF — o motor de regras (Tier 1 a 7) não muda nada,
// só troca de onde vem o dado.
app.get('/api/folha/:competencia', async (req, res) => {
  const m = /^(\d{2})-(\d{4})$/.exec(req.params.competencia); // formato da URL: MM-AAAA
  if (!m) return res.status(400).json({ ok: false, erro: 'Competência inválida. Use o formato MM-AAAA na URL, ex: /api/folha/11-2025.' });
  const numEmp = Number(req.query.empresa);
  if (!EMPRESAS[numEmp]) return res.status(400).json({ ok: false, erro: 'Parâmetro ?empresa= obrigatório e deve ser um NumEmp válido. Veja /api/empresas.' });
  const [, mes, ano] = m;
  const perref = `${ano}-${mes}-01`;

  try {
    const conn = await getPool();
    const request = conn.request();
    request.input('perref', sql.Date, perref);
    request.input('numEmp', sql.SmallInt, numEmp);

    const resultado = await request.query(`
      SELECT
        f.NumEmp, f.TipCol, f.NumCad, f.NomFun, f.DatAdm, f.CodCar, f.ValSal,
        f.CodCCU, f.SitAfa, f.PerIns, f.PerPer,
        car.TitCar, sit.DesSit AS DescSituacao, ccu.NomCCU,
        m.TabEve, m.CodEve, r.DesRub, r.TipRub, m.RefEve, m.ValEve
      FROM vetorh.R044CAL c
      JOIN vetorh.R044MOV m ON m.NumEmp = c.NumEmp AND m.CodCal = c.CodCal
      JOIN vetorh.R034FUN f ON f.NumEmp = m.NumEmp AND f.TipCol = m.TipCol AND f.NumCad = m.NumCad
      LEFT JOIN vetorh.R008RUB r ON r.NumEmp = m.NumEmp AND r.TabEve = m.TabEve AND r.CodEve = m.CodEve
      LEFT JOIN vetorh.R024CAR car ON car.CodCar = f.CodCar
      LEFT JOIN vetorh.R010SIT sit ON sit.CodSit = f.SitAfa
      LEFT JOIN vetorh.R018CCU ccu ON ccu.CodCCU = f.CodCCU AND ccu.NumEmp = f.NumEmp
      WHERE c.PerRef = @perref AND c.NumEmp = @numEmp
      ORDER BY f.NumCad, m.TabEve, m.CodEve
    `);

    // Agrupa as linhas (uma por rubrica) em um colaborador por matrícula,
    // igual ao parseFolha() faz a partir do texto do PDF.
    const porMatricula = new Map();
    for (const row of resultado.recordset) {
      const matricula = String(row.NumCad);
      if (!porMatricula.has(matricula)) {
        porMatricula.set(matricula, {
          matricula, nome: row.NomFun, admissao: row.DatAdm, cargo: row.TitCar || row.CodCar,
          salario_base: row.ValSal, centro_custo: row.NomCCU || row.CodCCU, status: row.DescSituacao || String(row.SitAfa),
          perc_insalubridade: row.PerIns, perc_periculosidade: row.PerPer,
          rubricas: [], totais: { proventos: 0, descontos: 0, liquido: 0 },
        });
      }
      const colaborador = porMatricula.get(matricula);
      colaborador.rubricas.push({
        cod: String(row.CodEve), desc: row.DesRub || `Evento ${row.CodEve}`,
        referencia: row.RefEve, valor: row.ValEve,
      });
      // TipRub: 1 = provento, 2 = desconto, 3/4 = informativo (ex: FGTS —
      // nunca desconta do líquido, é só depositado à parte) — confirmado
      // contra R008RUB real, não é suposição.
      const valor = row.ValEve || 0;
      const tipRub = Number(row.TipRub);
      if (tipRub === 1) colaborador.totais.proventos += valor;
      else if (tipRub === 2) colaborador.totais.descontos += valor;
    }
    for (const colaborador of porMatricula.values()) {
      colaborador.totais.proventos = Math.round(colaborador.totais.proventos * 100) / 100;
      colaborador.totais.descontos = Math.round(colaborador.totais.descontos * 100) / 100;
      colaborador.totais.liquido = Math.round((colaborador.totais.proventos - colaborador.totais.descontos) * 100) / 100;
    }

    res.json({ ok: true, competencia: req.params.competencia, colaboradores: [...porMatricula.values()] });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// Visão consolidada rápida: headcount ativo de cada empresa numa
// competência, sem puxar a folha inteira de cada uma — é a base do futuro
// Dashboard Consolidado (visão CEO, todas as empresas lado a lado).
app.get('/api/empresas/resumo/:competencia', async (req, res) => {
  const m = /^(\d{2})-(\d{4})$/.exec(req.params.competencia);
  if (!m) return res.status(400).json({ ok: false, erro: 'Competência inválida. Use o formato MM-AAAA na URL.' });
  const [, mes, ano] = m;
  const perref = `${ano}-${mes}-01`;

  try {
    const conn = await getPool();
    const request = conn.request();
    request.input('perref', sql.Date, perref);
    const resultado = await request.query(`
      SELECT f.NumEmp, COUNT(DISTINCT f.NumCad) AS headcountAtivo
      FROM vetorh.R044CAL c
      JOIN vetorh.R044MOV m ON m.NumEmp = c.NumEmp AND m.CodCal = c.CodCal
      JOIN vetorh.R034FUN f ON f.NumEmp = m.NumEmp AND f.TipCol = m.TipCol AND f.NumCad = m.NumCad
      WHERE c.PerRef = @perref AND f.SitAfa = 1
      GROUP BY f.NumEmp
    `);
    const porEmpresa = Object.fromEntries(resultado.recordset.map((r) => [r.NumEmp, r.headcountAtivo]));
    const resumo = Object.entries(EMPRESAS).map(([numEmp, info]) => ({
      numEmp: Number(numEmp), nome: info.nome, ativa: info.ativa, headcountAtivo: porEmpresa[numEmp] || 0,
    }));
    res.json({ ok: true, competencia: req.params.competencia, empresas: resumo });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// ============================================================
// ANÁLISE HISTÓRICA — o SQL Server faz a conta pesada (agregação por mês),
// o Confere GT só recebe o resumo já pronto. Isso é o que permite achar
// "paramos de pagar X pro centro de custo Y a partir de quando" sem
// processar milhões de linhas de movimento no navegador a cada login.
// ============================================================

// Resumo mês a mês de toda rubrica paga em cada centro de custo, desde o
// início do histórico. Um registro por (CentroCusto, Rubrica, Mês) — muito
// menor que o movimento cru (que teria uma linha por colaborador).
app.get('/api/historico/rubrica-por-centro-custo', async (req, res) => {
  const numEmp = Number(req.query.empresa);
  if (!EMPRESAS[numEmp]) return res.status(400).json({ ok: false, erro: 'Parâmetro ?empresa= obrigatório e deve ser um NumEmp válido.' });
  // ?desde=MM-AAAA&ate=MM-AAAA (opcionais) — sem eles, traz o histórico
  // inteiro. Com eles, o SQL Server já filtra antes de agregar (mais rápido
  // e mais leve pro servidor do que trazer tudo e filtrar no navegador).
  const parseComp = (v) => {
    const m = /^(\d{2})-(\d{4})$/.exec(v || '');
    return m ? `${m[2]}-${m[1]}-01` : null;
  };
  const desde = parseComp(req.query.desde);
  const ate = parseComp(req.query.ate);
  try {
    const conn = await getPool();
    const request = conn.request();
    request.input('numEmp', sql.SmallInt, numEmp);
    if (desde) request.input('desde', sql.Date, desde);
    if (ate) request.input('ate', sql.Date, ate);
    const resultado = await request.query(`
      SELECT
        f.CodCCU, ccu.NomCCU, m.CodEve, r.DesRub, c.PerRef,
        SUM(m.ValEve) AS totalValor,
        COUNT(DISTINCT f.NumCad) AS colaboradores
      FROM vetorh.R044CAL c
      JOIN vetorh.R044MOV m ON m.NumEmp = c.NumEmp AND m.CodCal = c.CodCal
      JOIN vetorh.R034FUN f ON f.NumEmp = m.NumEmp AND f.TipCol = m.TipCol AND f.NumCad = m.NumCad
      LEFT JOIN vetorh.R008RUB r ON r.NumEmp = m.NumEmp AND r.TabEve = m.TabEve AND r.CodEve = m.CodEve
      LEFT JOIN vetorh.R018CCU ccu ON ccu.CodCCU = f.CodCCU AND ccu.NumEmp = f.NumEmp
      WHERE c.NumEmp = @numEmp
        ${desde ? 'AND c.PerRef >= @desde' : ''}
        ${ate ? 'AND c.PerRef <= @ate' : ''}
      GROUP BY f.CodCCU, ccu.NomCCU, m.CodEve, r.DesRub, c.PerRef
      HAVING SUM(m.ValEve) <> 0
      ORDER BY f.CodCCU, m.CodEve, c.PerRef
    `);
    const serie = resultado.recordset.map((r) => {
      const d = new Date(r.PerRef);
      return {
        codCCU: r.CodCCU, nomCCU: r.NomCCU, codEve: r.CodEve, desRub: r.DesRub || `Evento ${r.CodEve}`,
        competencia: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
        totalValor: r.totalValor, colaboradores: r.colaboradores,
      };
    });
    res.json({ ok: true, empresa: EMPRESAS[numEmp].nome, serie });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// Histórico completo de um colaborador específico (todas as rubricas, todos
// os meses que ele apareceu) — pra achar "recebia X, parou de receber" ou
// vice-versa no nível individual.
app.get('/api/historico/colaborador/:matricula', async (req, res) => {
  const numEmp = Number(req.query.empresa);
  if (!EMPRESAS[numEmp]) return res.status(400).json({ ok: false, erro: 'Parâmetro ?empresa= obrigatório e deve ser um NumEmp válido.' });
  const numCad = Number(req.params.matricula);
  if (!numCad) return res.status(400).json({ ok: false, erro: 'Matrícula inválida.' });
  try {
    const conn = await getPool();
    const request = conn.request();
    request.input('numEmp', sql.SmallInt, numEmp);
    request.input('numCad', sql.Int, numCad);
    const resultado = await request.query(`
      SELECT c.PerRef, m.CodEve, r.DesRub, m.ValEve, m.RefEve
      FROM vetorh.R034FUN f
      JOIN vetorh.R044MOV m ON m.NumEmp = f.NumEmp AND m.TipCol = f.TipCol AND m.NumCad = f.NumCad
      JOIN vetorh.R044CAL c ON c.NumEmp = m.NumEmp AND c.CodCal = m.CodCal
      LEFT JOIN vetorh.R008RUB r ON r.NumEmp = m.NumEmp AND r.TabEve = m.TabEve AND r.CodEve = m.CodEve
      WHERE f.NumEmp = @numEmp AND f.NumCad = @numCad
      ORDER BY c.PerRef, m.CodEve
    `);
    const historico = resultado.recordset.map((r) => {
      const d = new Date(r.PerRef);
      return {
        competencia: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
        codEve: r.CodEve, desRub: r.DesRub || `Evento ${r.CodEve}`, valor: r.ValEve, referencia: r.RefEve,
      };
    });
    res.json({ ok: true, matricula: req.params.matricula, historico });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

const PORTA = process.env.PORT || 3001;
app.listen(PORTA, () => console.log(`Confere GT Backend rodando na porta ${PORTA}`));

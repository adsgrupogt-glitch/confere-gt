// vetorh-api.js
// Cliente do Confere GT pro backend do Vetorh (server.js, rodando local ou
// atrás do Cloudflare Tunnel). Nenhuma credencial de banco passa por aqui —
// só a chave de API própria deste backend, que fica salva localmente no
// navegador de quem estiver testando (nunca no código-fonte do Confere GT).

const CHAVE_LOCAL_STORAGE_URL = 'confereGT_vetorhApiUrl';
const CHAVE_LOCAL_STORAGE_KEY = 'confereGT_vetorhApiKey';

export function getVetorhApiUrl() {
  return localStorage.getItem(CHAVE_LOCAL_STORAGE_URL) || 'http://localhost:3001';
}
export function setVetorhApiUrl(url) {
  localStorage.setItem(CHAVE_LOCAL_STORAGE_URL, url);
}
export function getVetorhApiKey() {
  return localStorage.getItem(CHAVE_LOCAL_STORAGE_KEY) || '';
}
export function setVetorhApiKey(chave) {
  localStorage.setItem(CHAVE_LOCAL_STORAGE_KEY, chave);
}

async function chamar(caminho) {
  const url = `${getVetorhApiUrl()}${caminho}`;
  const resposta = await fetch(url, { headers: { 'x-api-key': getVetorhApiKey() } });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || !dados || dados.ok === false) {
    throw new Error(dados?.erro || `Falha ao chamar o backend do Vetorh (${resposta.status}).`);
  }
  return dados;
}

export async function testarConexaoVetorh() {
  return chamar('/api/testdb');
}

export async function listarEmpresasVetorh() {
  const r = await chamar('/api/empresas');
  return r.empresas;
}

export async function listarCompetenciasVetorh(numEmp) {
  const r = await chamar(`/api/competencias?empresa=${numEmp}`);
  return r.competencias;
}

// Devolve os colaboradores já no MESMO FORMATO que parseFolha() produz a
// partir do PDF — o motor de regras (Tier 1 a 7) não precisa saber se o
// dado veio de PDF ou do banco.
export async function buscarFolhaVetorh(numEmp, competencia) {
  const [mes, ano] = competencia.split('/');
  const r = await chamar(`/api/folha/${mes}-${ano}?empresa=${numEmp}`);
  return r.colaboradores;
}

export async function resumoEmpresasVetorh(competencia) {
  const [mes, ano] = competencia.split('/');
  const r = await chamar(`/api/empresas/resumo/${mes}-${ano}`);
  return r.empresas;
}

// Série histórica agregada (Centro de Custo x Rubrica x Mês) — o SQL Server
// já resume, aqui só recebe o resultado compacto. desde/ate são opcionais
// (formato "MM/AAAA"); sem eles, traz o histórico inteiro.
export async function historicoRubricaPorCentroCustoVetorh(numEmp, desde, ate) {
  let caminho = `/api/historico/rubrica-por-centro-custo?empresa=${numEmp}`;
  if (desde) caminho += `&desde=${desde.replace('/', '-')}`;
  if (ate) caminho += `&ate=${ate.replace('/', '-')}`;
  const r = await chamar(caminho);
  return r.serie;
}

export async function historicoColaboradorVetorh(numEmp, matricula) {
  const r = await chamar(`/api/historico/colaborador/${matricula}?empresa=${numEmp}`);
  return r.historico;
}

// Pente fino de Vale Alimentação — linhas cruas (a análise/detecção de
// anomalia acontece no analise-va.js, não aqui). Passe um número em `meses`
// (janela rolante) OU { desde, ate } (período explícito, formato "MM/AAAA").
export async function auditoriaValeAlimentacaoVetorh(numEmp, periodo = 6) {
  let caminho = `/api/auditoria/vale-alimentacao?empresa=${numEmp}`;
  if (typeof periodo === 'object') {
    if (periodo.desde) caminho += `&desde=${periodo.desde.replace('/', '-')}`;
    if (periodo.ate) caminho += `&ate=${periodo.ate.replace('/', '-')}`;
  } else {
    caminho += `&meses=${periodo}`;
  }
  const r = await chamar(caminho);
  return r.linhas;
}

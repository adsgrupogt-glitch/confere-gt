// dados.js
// Estrutura no Realtime Database (multi-empresa, Grupo GT inteiro):
//
// /empresas/{numEmp}/
//     /folhas/{competencia}/          -> ex: "06-2026"
//         /resumo                     -> { status, colaboradores, proventos, descontos, liquido }
//         /tiers/{tier}               -> { total, alta }
//         /excecoes/{tier}/{id}       -> item de exceção
//         /colaboradores/{matricula}  -> snapshot mensal enxuto
//         /analytics                  -> indicadores calculados do mês
//     /estruturaOrganizacional        -> mapa Local -> Chefia dessa empresa
//
// /usuarios/{login}                   -> ver auth.js (compartilhado entre empresas)
// /atividade                          -> linha do tempo (compartilhada, mostra tudo)

import { ref, get, set, update, remove, push } from 'firebase/database';
import { db } from './firebase-config';

const chaveComp = (competencia) => competencia.replace('/', '-'); // "06/2026" -> "06-2026"
const base = (numEmp) => `empresas/${numEmp}`;

export async function salvarResumoCompetencia(numEmp, competencia, resumo) {
  await set(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}/resumo`), resumo);
}

export async function salvarTiers(numEmp, competencia, tiers) {
  await set(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}/tiers`), tiers);
}

export async function salvarAnalytics(numEmp, competencia, analytics) {
  await set(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}/analytics`), analytics);
}

// Snapshot mensal enxuto por colaborador (não a folha completa) — é o que
// permite detectar admissão/demissão/transferência/férias mês a mês, cruzado
// depois com a estrutura organizacional (Chefias). Guardado à parte da
// conferência legal em si, pra não inflar o nó de exceções.
export async function salvarColaboradoresResumo(numEmp, competencia, mapaMatriculaInfo) {
  await set(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}/colaboradores`), mapaMatriculaInfo);
}

// Estrutura organizacional (Local/Posto -> Chefia) extraída do Relatório de
// Chefia (FPRE120), UMA POR EMPRESA — cada empresa do Grupo GT tem sua
// própria hierarquia de Chefias. É um snapshot no tempo — atualiza quando
// você sobe um relatório novo.
//
// IMPORTANTE: nomes de posto/chefia viram texto livre com ".", "/" etc.
// (ex: "Cond. X - Port/Zel/Limp"), e essas são chaves proibidas no Realtime
// Database. Por isso guardamos como LISTA de pares, nunca como objeto
// chaveado pelo nome — e reconstruímos o objeto de lookup na leitura.
export async function salvarEstruturaOrganizacional(numEmp, dadosEstrutura) {
  const localParaChefiaLista = Object.entries(dadosEstrutura.localParaChefia).map(([local, chefia]) => ({ local, chefia }));
  const locaisPorChefiaLista = Object.entries(dadosEstrutura.locaisPorChefia).map(([chefia, locais]) => ({ chefia, locais }));
  await set(ref(db, `${base(numEmp)}/estruturaOrganizacional`), {
    localParaChefiaLista, locaisPorChefiaLista,
    chefiasAdministrativas: dadosEstrutura.chefiasAdministrativas,
    totalChefias: dadosEstrutura.totalChefias,
    totalLocais: dadosEstrutura.totalLocais,
    atualizadoEm: new Date().toISOString(),
  });
}

export async function lerEstruturaOrganizacional(numEmp) {
  const snap = await get(ref(db, `${base(numEmp)}/estruturaOrganizacional`));
  if (!snap.exists()) return null;
  const v = snap.val();
  const localParaChefia = {};
  (v.localParaChefiaLista || []).forEach(({ local, chefia }) => { localParaChefia[local] = chefia; });
  const locaisPorChefia = {};
  (v.locaisPorChefiaLista || []).forEach(({ chefia, locais }) => { locaisPorChefia[chefia] = locais; });
  return { ...v, localParaChefia, locaisPorChefia };
}

export async function salvarExcecoes(numEmp, competencia, tier, lista) {
  await set(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}/excecoes/${tier}`), lista);
}

export async function lerCompetencia(numEmp, competencia) {
  const snap = await get(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}`));
  return snap.exists() ? snap.val() : null;
}

export async function listarCompetencias(numEmp) {
  const snap = await get(ref(db, `${base(numEmp)}/folhas`));
  if (!snap.exists()) return [];
  return Object.keys(snap.val()).sort().map((k) => k.replace('-', '/'));
}

export async function fecharCompetencia(numEmp, competencia) {
  await update(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}/resumo`), { status: 'fechada' });
}

// Apaga uma competência inteira do Firebase — usado pra limpar entradas
// inválidas/duplicadas (ex: competência digitada errado, ou conferência que
// falhou no meio e deixou nó incompleto). Irreversível, por isso é admin-only
// na UI e sempre pede confirmação antes de chamar.
export async function excluirCompetencia(numEmp, competencia) {
  await remove(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}`));
}

export async function atualizarStatusExcecao(numEmp, competencia, tier, idExcecao, novoStatus, parecer) {
  await update(ref(db, `${base(numEmp)}/folhas/${chaveComp(competencia)}/excecoes/${tier}/${idExcecao}`), {
    status: novoStatus,
    parecer: parecer || '',
    atualizadoEm: new Date().toISOString(),
  });
}

// Registra um evento na linha do tempo da auditoria (aba Dashboard). Fica
// compartilhada entre empresas (mas cada texto já cita a empresa quando
// relevante), pra dar uma visão única de "tudo que aconteceu" pro CEO.
export async function registrarAtividade(texto, tipo = 'info') {
  const novaRef = push(ref(db, 'atividade'));
  await set(novaRef, { texto, tipo, quando: new Date().toISOString() });
}

export async function listarAtividade(limite = 20) {
  const snap = await get(ref(db, 'atividade'));
  if (!snap.exists()) return [];
  return Object.values(snap.val())
    .sort((a, b) => new Date(b.quando) - new Date(a.quando))
    .slice(0, limite);
}

// dados.js
// Estrutura no Realtime Database:
//
// /folhas/{competencia}/            -> ex: "06-2026"
//     /resumo                       -> { status, colaboradores, proventos, descontos, liquido }
//     /tiers/{tier}                 -> { total, alta }
//     /excecoes/{tier}/{id}         -> item de exceção (ver rule_engine.py -> mesmo formato)
//     /colaboradores/{matricula}    -> dados parseados da folha (rubricas, totais)
//
// /usuarios/{login}                 -> ver auth.js

import { ref, get, set, update, remove, push } from 'firebase/database';
import { db } from './firebase-config';

const chaveComp = (competencia) => competencia.replace('/', '-'); // "06/2026" -> "06-2026"

export async function salvarResumoCompetencia(competencia, resumo) {
  await set(ref(db, `folhas/${chaveComp(competencia)}/resumo`), resumo);
}

export async function salvarTiers(competencia, tiers) {
  await set(ref(db, `folhas/${chaveComp(competencia)}/tiers`), tiers);
}

export async function salvarAnalytics(competencia, analytics) {
  await set(ref(db, `folhas/${chaveComp(competencia)}/analytics`), analytics);
}

// Snapshot mensal enxuto por colaborador (não a folha completa) — é o que
// permite detectar admissão/demissão/transferência/férias mês a mês, cruzado
// depois com a estrutura organizacional (Chefias). Guardado à parte da
// conferência legal em si, pra não inflar o nó de exceções.
export async function salvarColaboradoresResumo(competencia, mapaMatriculaInfo) {
  await set(ref(db, `folhas/${chaveComp(competencia)}/colaboradores`), mapaMatriculaInfo);
}

// Estrutura organizacional (Local/Posto -> Chefia) extraída do Relatório de
// Chefia (FPRE120). É um snapshot no tempo — atualiza quando você sobe um
// relatório novo. Fica fora de /folhas porque não pertence a uma competência.
// Estrutura organizacional (Local/Posto -> Chefia) extraída do Relatório de
// Chefia (FPRE120). É um snapshot no tempo — atualiza quando você sobe um
// relatório novo. Fica fora de /folhas porque não pertence a uma competência.
//
// IMPORTANTE: nomes de posto/chefia viram texto livre com ".", "/" etc.
// (ex: "Cond. X - Port/Zel/Limp"), e essas são chaves proibidas no Realtime
// Database. Por isso guardamos como LISTA de pares, nunca como objeto
// chaveado pelo nome — e reconstruímos o objeto de lookup na leitura.
export async function salvarEstruturaOrganizacional(dadosEstrutura) {
  const localParaChefiaLista = Object.entries(dadosEstrutura.localParaChefia).map(([local, chefia]) => ({ local, chefia }));
  const locaisPorChefiaLista = Object.entries(dadosEstrutura.locaisPorChefia).map(([chefia, locais]) => ({ chefia, locais }));
  await set(ref(db, 'estruturaOrganizacional'), {
    localParaChefiaLista, locaisPorChefiaLista,
    chefiasAdministrativas: dadosEstrutura.chefiasAdministrativas,
    totalChefias: dadosEstrutura.totalChefias,
    totalLocais: dadosEstrutura.totalLocais,
    atualizadoEm: new Date().toISOString(),
  });
}

export async function lerEstruturaOrganizacional() {
  const snap = await get(ref(db, 'estruturaOrganizacional'));
  if (!snap.exists()) return null;
  const v = snap.val();
  const localParaChefia = {};
  (v.localParaChefiaLista || []).forEach(({ local, chefia }) => { localParaChefia[local] = chefia; });
  const locaisPorChefia = {};
  (v.locaisPorChefiaLista || []).forEach(({ chefia, locais }) => { locaisPorChefia[chefia] = locais; });
  return { ...v, localParaChefia, locaisPorChefia };
}

export async function salvarExcecoes(competencia, tier, lista) {
  await set(ref(db, `folhas/${chaveComp(competencia)}/excecoes/${tier}`), lista);
}

export async function lerCompetencia(competencia) {
  const snap = await get(ref(db, `folhas/${chaveComp(competencia)}`));
  return snap.exists() ? snap.val() : null;
}

export async function listarCompetencias() {
  const snap = await get(ref(db, 'folhas'));
  if (!snap.exists()) return [];
  return Object.keys(snap.val()).sort().map((k) => k.replace('-', '/'));
}

export async function fecharCompetencia(competencia) {
  await update(ref(db, `folhas/${chaveComp(competencia)}/resumo`), { status: 'fechada' });
}

// Apaga uma competência inteira do Firebase — usado pra limpar entradas
// inválidas/duplicadas (ex: competência digitada errado, ou conferência que
// falhou no meio e deixou nó incompleto). Irreversível, por isso é admin-only
// na UI e sempre pede confirmação antes de chamar.
export async function excluirCompetencia(competencia) {
  await remove(ref(db, `folhas/${chaveComp(competencia)}`));
}

export async function atualizarStatusExcecao(competencia, tier, idExcecao, novoStatus, parecer) {
  await update(ref(db, `folhas/${chaveComp(competencia)}/excecoes/${tier}/${idExcecao}`), {
    status: novoStatus,
    parecer: parecer || '',
    atualizadoEm: new Date().toISOString(),
  });
}

// Registra um evento na linha do tempo da auditoria (aba Dashboard)
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

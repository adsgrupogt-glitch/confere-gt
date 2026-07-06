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

import { ref, get, set, update, push } from 'firebase/database';
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
export async function salvarEstruturaOrganizacional(dados) {
  await set(ref(db, 'estruturaOrganizacional'), { ...dados, atualizadoEm: new Date().toISOString() });
}

export async function lerEstruturaOrganizacional() {
  const snap = await get(ref(db, 'estruturaOrganizacional'));
  return snap.exists() ? snap.val() : null;
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

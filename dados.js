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

// regras-tier5.js
// Cruza o Relatório de Horas Extras (ponto) com a folha: soma as horas pagas
// como hora extra (códigos 257/259/261/264) e compara contra as horas
// registradas no ponto para o mesmo colaborador no mesmo mês.
//
// Confiança alta: folha paga MAIS horas do que o ponto registrou — nunca
// deveria acontecer, é dinheiro saindo sem lastro em ponto.
// Confiança revisar: ponto registrou MUITO mais do que a folha pagou — risco
// de hora trabalhada e não paga. Suavizado (menor confiança) para os postos
// com banco de horas confirmado, onde isso é esperado.

const CODIGOS_HE = ['257', '259', '261', '264'];
const POSTOS_BANCO_DE_HORAS = ['rg serviços adm', 'rg servicos adm', 'educandário imaculada conceição', 'educandario imaculada conceicao', 'torus business center'];

function ehBancoDeHoras(centroCusto) {
  const norm = (centroCusto || '').toLowerCase();
  return POSTOS_BANCO_DE_HORAS.some((p) => norm.includes(p));
}

/**
 * @param {Array} colaboradores - saída do parseFolha
 * @param {Record<string, {totalHoras:number}>} pontoPorMatricula - saída do parseHorasExtras
 * @param {string} competencia
 */
export function tier5HorasExtras(colaboradores, pontoPorMatricula, competencia) {
  const out = [];
  if (!pontoPorMatricula) return out;

  for (const e of colaboradores) {
    const ponto = pontoPorMatricula[e.matricula];
    const horasPagas = e.rubricas
      .filter((r) => CODIGOS_HE.includes(r.cod))
      .reduce((s, r) => s + (r.referencia || 0), 0);
    const horasPonto = ponto?.totalHoras || 0;

    if (horasPonto === 0 && horasPagas === 0) continue; // sem hora extra em nenhuma fonte

    const diferenca = Math.round((horasPagas - horasPonto) * 10) / 10;

    if (horasPagas > horasPonto + 0.5) {
      out.push({
        competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo, centro_custo: e.centro_custo,
        regra: 'Folha paga mais horas extras do que o ponto registrou no período',
        esperado: horasPonto, lancado: horasPagas, diferenca, confianca: 'alta',
        obs: 'Diferença entre horas pagas (cód. 257/259/261/264) e horas do relatório de ponto.',
      });
    } else if (horasPonto > horasPagas + 5 && horasPonto > horasPagas * 1.2) {
      const bancoHoras = ehBancoDeHoras(e.centro_custo);
      out.push({
        competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo, centro_custo: e.centro_custo,
        regra: bancoHoras
          ? 'Ponto registrou mais horas do que a folha pagou — posto com banco de horas confirmado, pode ser compensação'
          : 'Ponto registrou mais horas do que a folha pagou — possível hora trabalhada e não paga',
        esperado: horasPonto, lancado: horasPagas, diferenca, confianca: bancoHoras ? 'revisar' : 'alta',
        obs: bancoHoras ? 'Posto usa banco de horas — confirmar compensação antes de tratar como erro.' : 'Nenhum banco de horas conhecido neste posto.',
      });
    }
  }
  return out;
}

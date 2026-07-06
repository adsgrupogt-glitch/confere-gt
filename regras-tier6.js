// regras-tier6.js
// Conta "dobras" (lançamento de ponto próximo de um turno inteiro extra,
// >= 10:30) por colaborador em regime 12x36 no mês. A CCT (Cláusula 35ª §7º)
// permite até 5 dobras/mês pagas como hora extra — acima disso é risco de
// conformidade e de saúde/segurança do trabalhador.

const LIMITE_DOBRAS_MES = 5;
const LIMIAR_DOBRA_HORAS = 10.5; // 10:30

export function tier6Dobras(pontoPorMatricula, colaboradoresPorMatricula, competencia) {
  const out = [];
  if (!pontoPorMatricula) return out;

  for (const [matricula, ponto] of Object.entries(pontoPorMatricula)) {
    const cargoLower = (ponto.cargo || '').toLowerCase();
    if (!cargoLower.includes('12x36')) continue;

    const dobras = ponto.lancamentos.filter((l) => l.horas >= LIMIAR_DOBRA_HORAS);
    if (dobras.length <= LIMITE_DOBRAS_MES) continue;

    const colaborador = colaboradoresPorMatricula?.[matricula];
    out.push({
      competencia, matricula, nome: ponto.nome, cargo: ponto.cargo, centro_custo: ponto.posto,
      regra: `${dobras.length} dobras no mês — limite da CCT (Cláusula 35ª §7º) é ${LIMITE_DOBRAS_MES}`,
      esperado: LIMITE_DOBRAS_MES, lancado: dobras.length, diferenca: dobras.length - LIMITE_DOBRAS_MES,
      confianca: 'alta',
      obs: colaborador && !colaborador.status?.includes('Trabalhando')
        ? 'Colaborador não está mais em status Trabalhando neste mês — checar se dobras foram de fato pagas.'
        : 'Risco de conformidade (sobrejornada) e de saúde/segurança do trabalhador, além de risco de pagamento.',
    });
  }
  return out.sort((a, b) => b.lancado - a.lancado);
}

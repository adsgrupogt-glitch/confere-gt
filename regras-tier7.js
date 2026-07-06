// regras-tier7.js
// Férias pagas fora do prazo legal (Art. 134/137 CLT): as férias devem ser
// concedidas dentro dos 12 meses seguintes ao fim do período aquisitivo.
// Passado esse prazo, são "vencidas" e o empregador deve pagar em dobro.
// Fonte: lote de Recibos de Férias (parser-ferias.js) — não é possível
// calcular isso só com a folha mensal, precisa do período aquisitivo real.

const fmtData = (d) => d ? d.toLocaleDateString('pt-BR') : '—';

export function tier7FeriasVencidas(recibos, competencia) {
  const out = [];
  for (const r of recibos) {
    if (!r.forExtraPrazo) continue;
    const diasAtraso = Math.round((r.periodoFeriasInicio - r.prazoConcessivoFim) / 86400000);
    out.push({
      competencia, matricula: r.matricula, nome: r.nome, cargo: r.cargo,
      regra: r.temRubricaDobro
        ? 'Férias concedidas fora do prazo legal — recibo já indica pagamento em dobro'
        : 'Férias concedidas fora do prazo legal (Art. 134/137 CLT) — verificar se foi pago em dobro',
      esperado: fmtData(r.prazoConcessivoFim), lancado: fmtData(r.periodoFeriasInicio),
      diferenca: diasAtraso,
      confianca: r.temRubricaDobro ? 'revisar' : 'alta',
      obs: `Período aquisitivo: ${fmtData(r.periodoAquisitivoInicio)} a ${fmtData(r.periodoAquisitivoFim)}. `
        + `Prazo concessivo terminava em ${fmtData(r.prazoConcessivoFim)} — férias começaram ${diasAtraso} dia(s) depois.`,
    });
  }
  return out;
}

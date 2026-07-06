// parser-horas-extras.js
// Extrai o "Relatório de horas extras" (sistema de ponto, feito por
// ferramenta diferente do Senior) — usado pelos Tiers 5 (Horas Extras vs
// Ponto) e 6 (Dobras acima do limite CCT).
//
// Formato (um bloco por colaborador, texto já em ordem de leitura via
// extrairTextoSequencial): "Cliente: X ... Posto: Y ... MATRÍCULA - NOME -
// Cargo: CARGO - CPF: NNN  DD/MM  HH:MM  DD/MM  HH:MM ...  Total de horas: HH:MM"
// Cada par DD/MM + HH:MM é um lançamento de hora extra registrado no ponto
// naquele dia (podem existir vários lançamentos no mesmo dia, tratados aqui
// como entradas separadas — o que importa pro Tier 6 é o maior lançamento
// isolado do dia, não a soma).

function horasParaDecimal(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h + m / 60;
}

/**
 * @param {string} texto - saída de extrairTextoSequencial() sobre o PDF de Horas Extras
 * @returns {Record<string, {nome, cargo, cliente, posto, lancamentos: Array<{data, horas}>, totalHoras}>}
 */
export function parseHorasExtras(texto) {
  // Cliente/Posto abrem contexto que vale até o próximo "Cliente:"
  const blocosCliente = texto.split(/Cliente:\s*/).slice(1);
  const resultado = {};

  const REGEX_EMPREGADO = /(\d{9})\s*-\s*(.+?)\s*-\s*Cargo:\s*(.+?)\s*-\s*CPF:\s*\d+/g;
  const REGEX_LANCAMENTO = /(\d{2}\/\d{2})\s+(\d{1,3}:\d{2})/g;
  const REGEX_TOTAL = /Total de horas:\s*(\d{1,4}:\d{2})/;

  for (const blocoBruto of blocosCliente) {
    const nomeCliente = blocoBruto.split(/\s{2,}|Posto:/)[0].trim();
    const mPosto = /Posto:\s*(.+?)\s*-\s*Unid\./.exec(blocoBruto);
    const posto = mPosto ? mPosto[1].trim() : nomeCliente;

    // Divide o bloco do cliente em sub-blocos por colaborador, usando a
    // posição de cada match de "MATRÍCULA - NOME - Cargo: ... - CPF: ..."
    const marcadores = [...blocoBruto.matchAll(REGEX_EMPREGADO)];
    for (let i = 0; i < marcadores.length; i++) {
      const m = marcadores[i];
      const matricula = m[1];
      const nome = m[2].trim();
      const cargo = m[3].trim();
      const inicio = m.index + m[0].length;
      const fim = i + 1 < marcadores.length ? marcadores[i + 1].index : blocoBruto.length;
      const trecho = blocoBruto.slice(inicio, fim);

      const lancamentos = [...trecho.matchAll(REGEX_LANCAMENTO)].map(([, data, horas]) => ({
        data, horas: horasParaDecimal(horas),
      }));
      const mTotal = REGEX_TOTAL.exec(trecho);
      const totalHoras = mTotal ? horasParaDecimal(mTotal[1]) : lancamentos.reduce((s, l) => s + l.horas, 0);

      resultado[matricula] = { nome, cargo, cliente: nomeCliente, posto, lancamentos, totalHoras };
    }
  }

  if (Object.keys(resultado).length === 0) {
    throw new Error('Não consegui reconhecer nenhum lançamento neste PDF — confirma se é o Relatório de Horas Extras do sistema de ponto.');
  }
  return resultado;
}

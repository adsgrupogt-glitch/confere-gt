// parser-ferias.js
// Lê o lote de "Recibo de Férias" (Senior/Rubi) — um recibo por página/bloco,
// com o Período Aquisitivo e o Período das Férias explícitos. É a fonte que
// falta pra checar férias vencidas/pagas fora do prazo (Art. 134/137 CLT).

function parseDataBr(s) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function somarMeses(data, meses) {
  const d = new Date(data);
  d.setMonth(d.getMonth() + meses);
  return d;
}

/**
 * @param {string} texto - saída de extrairTextoLayout() sobre o PDF de Recibos de Férias
 * @returns {Array<{matricula, nome, cargo, periodoAquisitivoInicio, periodoAquisitivoFim,
 *   periodoFeriasInicio, periodoFeriasFim, prazoConcessivoFim, forExtraPrazo, rubricas}>}
 */
export function parseRecibosFerias(texto) {
  const marcadores = [...texto.matchAll(/Cadastro:\s*(\d{9})\s*-\s*(.+?)\s+CPF:/g)];
  if (marcadores.length === 0) {
    throw new Error('Não consegui reconhecer nenhum recibo neste PDF — confirma se é o lote de Recibos de Férias do Senior/Rubi.');
  }

  const recibos = [];
  for (let i = 0; i < marcadores.length; i++) {
    const m = marcadores[i];
    const matricula = m[1];
    const nome = m[2].trim();
    const inicio = m.index;
    const fim = i + 1 < marcadores.length ? marcadores[i + 1].index : texto.length;
    const trecho = texto.slice(inicio, fim);

    const mCargo = /Cargo:\s*\d*\s*-?\s*(.+)/.exec(trecho);
    const mAquis = /Per[ií]odo Aquisitivo\.*:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/.exec(trecho);
    const mFerias = /Per[ií]odo das F[ée]rias\s*\.*:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/.exec(trecho);
    if (!mAquis || !mFerias) continue; // recibo incompleto/ilegível, pula

    const periodoAquisitivoInicio = parseDataBr(mAquis[1]);
    const periodoAquisitivoFim = parseDataBr(mAquis[2]);
    const periodoFeriasInicio = parseDataBr(mFerias[1]);
    const periodoFeriasFim = parseDataBr(mFerias[2]);
    const prazoConcessivoFim = somarMeses(periodoAquisitivoFim, 12);
    const forExtraPrazo = periodoFeriasInicio > prazoConcessivoFim;

    const rubricasTexto = trecho.slice(trecho.indexOf('Evento') + 1);
    const temRubricaDobro = /dobro/i.test(rubricasTexto);

    recibos.push({
      matricula, nome, cargo: mCargo ? mCargo[1].trim().split(/\s{2,}/)[0] : null,
      periodoAquisitivoInicio, periodoAquisitivoFim, periodoFeriasInicio, periodoFeriasFim,
      prazoConcessivoFim, forExtraPrazo, temRubricaDobro,
    });
  }
  return recibos;
}

// analytics-chefia.js
// Cruza o histórico mensal de colaboradores (snapshot enxuto salvo por
// UploadScreen a cada conferência) com a estrutura organizacional (Local ->
// Chefia, extraída do Relatório de Chefia) para produzir, por Chefia:
// admissões, demissões, abandono, transferências, meses em férias e em
// saúde, headcount e custo do mês mais recente.
//
// Buckets administrativos (detectados automaticamente pelo parser-chefia,
// não por nome) são separados do ranking operacional — ver
// `chefiasAdministrativas` no retorno.

import { normalizarCentroCusto } from './parser-chefia.js';

function parseDataBr(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
  if (!m) return null;
  return { dia: +m[1], mes: +m[2], ano: +m[3] };
}

const STATUS_SAUDE = new Set(['Atestado', 'Auxílio', 'Acidente']);

/**
 * @param {Array<{competencia:string, colaboradores:Record<string,object>}>} mesesData
 *   ordenado cronologicamente, colaboradores = { matricula: {nome,cargo,cc,status,admissao,proventos} }
 * @param {Record<string,string>} localParaChefia - do parser-chefia (já normalizado)
 * @param {string[]} chefiasAdministrativas
 */
export function cruzarChefias(mesesData, localParaChefia, chefiasAdministrativas = []) {
  const setAdmin = new Set(chefiasAdministrativas);
  const chefiaDoCC = (cc) => localParaChefia[normalizarCentroCusto(cc)] || null;

  // Reconstrói histórico por matrícula: { matricula: { competencia: info } }
  const hist = new Map();
  for (const { competencia, colaboradores } of mesesData) {
    for (const [matricula, info] of Object.entries(colaboradores || {})) {
      if (!hist.has(matricula)) hist.set(matricula, {});
      hist.get(matricula)[competencia] = info;
    }
  }

  const ultimaComp = mesesData.length ? mesesData[mesesData.length - 1].competencia : null;
  const contadores = new Map(); // chefia -> {...}
  const headcountAtual = new Map();
  const custoAtual = new Map();
  const transferenciasDetalhe = [];
  const semCorrespondencia = new Map(); // centro_custo normalizado -> ocorrências
  const multiCcPorMes = {};

  const get = (chefia) => {
    if (!contadores.has(chefia)) contadores.set(chefia, { admissoes: 0, demissoes: 0, abandono: 0, transferencias: 0, ferias: 0, saude: 0 });
    return contadores.get(chefia);
  };

  for (const { competencia, colaboradores } of mesesData) {
    multiCcPorMes[competencia] = Object.values(colaboradores || {}).filter((e) => e.multiCC).length;
  }

  for (const [matricula, porMes] of hist.entries()) {
    const mesesPresentes = mesesData.map((m) => m.competencia).filter((c) => porMes[c]);
    mesesPresentes.forEach((mes, i) => {
      const info = porMes[mes];
      const chefia = chefiaDoCC(info.cc);
      if (!chefia) {
        const key = normalizarCentroCusto(info.cc);
        if (key) semCorrespondencia.set(key, (semCorrespondencia.get(key) || 0) + 1);
      }

      const adm = parseDataBr(info.admissao);
      if (adm && `${String(adm.mes).padStart(2, '0')}/${adm.ano}` === mes) get(chefia).admissoes += 1;
      if (info.status === 'Demitido') get(chefia).demissoes += 1;
      if (info.status === 'Abandono') get(chefia).abandono += 1;
      if (info.status === 'Férias') get(chefia).ferias += 1;
      if (STATUS_SAUDE.has(info.status)) get(chefia).saude += 1;

      if (mes === ultimaComp && info.status === 'Trabalhando') {
        headcountAtual.set(chefia, (headcountAtual.get(chefia) || 0) + 1);
        custoAtual.set(chefia, (custoAtual.get(chefia) || 0) + (info.proventos || 0));
      }

      if (i > 0) {
        const infoAnt = porMes[mesesPresentes[i - 1]];
        if (infoAnt.status === 'Trabalhando' && info.status === 'Trabalhando'
          && (infoAnt.cargo !== info.cargo || infoAnt.cc !== info.cc)) {
          get(chefia).transferencias += 1;
          transferenciasDetalhe.push({
            mes, chefia, matricula, nome: info.nome,
            cargoDe: infoAnt.cargo, cargoPara: info.cargo, ccDe: infoAnt.cc, ccPara: info.cc,
          });
        }
      }
    });
  }

  const ranking = [...contadores.entries()]
    .filter(([chefia]) => chefia)
    .map(([chefia, c]) => ({
      chefia, ...c,
      headcountAtual: headcountAtual.get(chefia) || 0,
      custoAtual: custoAtual.get(chefia) || 0,
      administrativo: setAdmin.has(chefia),
    }));

  ranking.sort((a, b) => b.headcountAtual - a.headcountAtual);

  const semCorrespondenciaArr = [...semCorrespondencia.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([centroCusto, ocorrencias]) => ({ centroCusto, ocorrencias }));

  return {
    ranking: ranking.filter((r) => !r.administrativo),
    pipelineAdministrativo: ranking.filter((r) => r.administrativo),
    transferencias: transferenciasDetalhe,
    semCorrespondencia: semCorrespondenciaArr,
    multiCcPorMes,
  };
}

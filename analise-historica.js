// analise-historica.js
// Recebe a série agregada (Centro de Custo x Rubrica x Mês, já resumida pelo
// SQL Server) e encontra sozinho: rubricas que COMEÇARAM a ser pagas num
// centro de custo, que PARARAM de ser pagas, ou que tiveram um BURACO no
// meio (pagou, parou, voltou a pagar). É heurístico — sinaliza padrão pra
// revisão humana, não afirma "isso é um erro".

const chaveOrdenavel = (comp) => {
  const [m, a] = comp.split('/');
  return `${a}-${m.padStart(2, '0')}`;
};

const MATERIALIDADE_MEDIA_MENSAL = 30; // ignora rubricas com média mensal irrisória (ruído)
const MESES_MINIMOS_PARADO = 3; // só considera "parou" se ficou 3+ meses sem pagar até o mês mais recente

export function detectarMudancasRubrica(serie, todasCompetencias) {
  const ordemComp = [...new Set(todasCompetencias)].sort((a, b) => chaveOrdenavel(a).localeCompare(chaveOrdenavel(b)));
  const indice = new Map(ordemComp.map((c, i) => [c, i]));
  const ultimoIndice = ordemComp.length - 1;

  const grupos = new Map();
  for (const item of serie) {
    const chave = `${item.codCCU}::${item.codEve}`;
    if (!grupos.has(chave)) grupos.set(chave, { codCCU: item.codCCU, nomCCU: item.nomCCU, codEve: item.codEve, desRub: item.desRub, ocorrencias: [] });
    grupos.get(chave).ocorrencias.push(item);
  }

  const achados = [];
  for (const g of grupos.values()) {
    g.ocorrencias.sort((a, b) => chaveOrdenavel(a.competencia).localeCompare(chaveOrdenavel(b.competencia)));
    const mediaMensal = g.ocorrencias.reduce((s, o) => s + Math.abs(o.totalValor), 0) / g.ocorrencias.length;
    if (mediaMensal < MATERIALIDADE_MEDIA_MENSAL) continue;

    const primeira = g.ocorrencias[0].competencia;
    const ultima = g.ocorrencias[g.ocorrencias.length - 1].competencia;
    const idxPrimeira = indice.get(primeira) ?? 0;
    const idxUltima = indice.get(ultima) ?? ultimoIndice;

    // "Parou de pagar" — última ocorrência já não é recente o bastante
    if (idxUltima < ultimoIndice - MESES_MINIMOS_PARADO + 1) {
      achados.push({
        tipo: 'parou', codCCU: g.codCCU, nomCCU: g.nomCCU, codEve: g.codEve, desRub: g.desRub,
        ultimaVezPago: ultima, mesesParado: ultimoIndice - idxUltima,
        mediaMensalQuandoAtivo: Math.round(mediaMensal * 100) / 100,
        totalMesesPagos: g.ocorrencias.length,
      });
    }

    // "Começou a pagar" — primeira ocorrência não é logo no início do
    // histórico da empresa, ou seja, é algo que passou a existir depois
    if (idxPrimeira > 0 && idxPrimeira < ultimoIndice - 1) {
      achados.push({
        tipo: 'comecou', codCCU: g.codCCU, nomCCU: g.nomCCU, codEve: g.codEve, desRub: g.desRub,
        comecouEm: primeira, mesesDesdeInicioEmpresa: idxPrimeira,
        mediaMensalQuandoAtivo: Math.round(mediaMensal * 100) / 100,
        totalMesesPagos: g.ocorrencias.length,
      });
    }

    // "Buraco" — pagou, silêncio de 3+ meses no meio, voltou a pagar
    for (let i = 1; i < g.ocorrencias.length; i++) {
      const gap = indice.get(g.ocorrencias[i].competencia) - indice.get(g.ocorrencias[i - 1].competencia);
      if (gap >= MESES_MINIMOS_PARADO + 1) {
        achados.push({
          tipo: 'buraco', codCCU: g.codCCU, nomCCU: g.nomCCU, codEve: g.codEve, desRub: g.desRub,
          parouEm: g.ocorrencias[i - 1].competencia, voltouEm: g.ocorrencias[i].competencia, mesesSemPagar: gap - 1,
          mediaMensalQuandoAtivo: Math.round(mediaMensal * 100) / 100,
        });
      }
    }
  }

  return achados.sort((a, b) => b.mediaMensalQuandoAtivo - a.mediaMensalQuandoAtivo);
}

// Detecta o mesmo padrão no nível de UM colaborador específico (recebia
// determinada rubrica, parou de receber, ou vice-versa) — usa o histórico
// completo dele (todas as competências que apareceu).
export function detectarMudancasColaborador(historico, todasCompetencias) {
  const ordemComp = [...new Set(todasCompetencias)].sort((a, b) => chaveOrdenavel(a).localeCompare(chaveOrdenavel(b)));
  const indice = new Map(ordemComp.map((c, i) => [c, i]));

  const porRubrica = new Map();
  for (const item of historico) {
    if (!porRubrica.has(item.codEve)) porRubrica.set(item.codEve, { codEve: item.codEve, desRub: item.desRub, ocorrencias: [] });
    porRubrica.get(item.codEve).ocorrencias.push(item);
  }

  const competenciasDoColaborador = [...new Set(historico.map((h) => h.competencia))].sort((a, b) => chaveOrdenavel(a).localeCompare(chaveOrdenavel(b)));
  const primeiraCompColaborador = competenciasDoColaborador[0];
  const ultimaCompColaborador = competenciasDoColaborador[competenciasDoColaborador.length - 1];

  const achados = [];
  for (const r of porRubrica.values()) {
    if (r.ocorrencias.every((o) => Math.abs(o.valor) < 1)) continue;
    r.ocorrencias.sort((a, b) => chaveOrdenavel(a.competencia).localeCompare(chaveOrdenavel(b.competencia)));
    const primeira = r.ocorrencias[0].competencia;
    const ultima = r.ocorrencias[r.ocorrencias.length - 1].competencia;

    if (primeira !== primeiraCompColaborador) {
      achados.push({ tipo: 'passou_a_receber', codEve: r.codEve, desRub: r.desRub, desde: primeira });
    }
    if (ultima !== ultimaCompColaborador) {
      achados.push({ tipo: 'parou_de_receber', codEve: r.codEve, desRub: r.desRub, ateQuando: ultima });
    }
  }
  return achados;
}

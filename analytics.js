// analytics.js
// Calcula o painel de indicadores de RH (visão CEO/Diretoria) a partir da
// lista de colaboradores já parseada pelo parser-folha.js. Roda no mesmo
// lugar (navegador) onde a conferência já roda — nada de PII crua é
// enviado ao Firebase, só os agregados calculados aqui.

function parseDataBr(s) {
  const [dia, mes, ano] = (s || '').split('/').map(Number);
  if (!dia || !mes || !ano) return null;
  return new Date(ano, mes - 1, dia);
}

const STATUS_AFASTAMENTO = ['Férias', 'Atestado', 'Auxílio', 'Licença', 'Lic.Rem', 'Lic.', 'Acidente', 'Horas'];

// Códigos de rubrica usados nos agregados abaixo (validados contra a folha real)
const COD = {
  HORAS_NORMAIS: '1',
  INSS: '2000', FGTS: '2500',
  VT: '2453', VA: '300', VA_NAO_UTILIZADO: '410',
  PERICULOSIDADE: '1952', INSALUBRIDADE: '1951', ADICIONAL_NOTURNO: '1950',
  HE_50: '257', HE_100: '259', HE_50_NOTURNO: '261',
  ASSIDUIDADE_VIP: '249', PREMIO_ASSIDUIDADE: '279',
};

function somaRubrica(colaborador, cod) {
  return colaborador.rubricas.filter((r) => r.cod === cod).reduce((s, r) => s + (r.valor || 0), 0);
}

/**
 * @param {Array} colaboradores  - saída do parseFolha
 * @param {Date}  periodoInicio  - primeiro dia da competência
 * @param {Date}  periodoFim     - último dia da competência
 */
export function calcularAnalytics(colaboradores, periodoInicio, periodoFim) {
  const headcountPorStatus = {};
  let afastadosTotal = 0;
  let admissoesNoMes = 0;
  let multiCC = 0;

  let proventos = 0, descontos = 0, liquido = 0;
  let inssBase = 0, fgtsBase = 0;
  let periculosidade = 0, insalubridade = 0, adicionalNoturno = 0;
  let he50 = 0, he100 = 0, he50Noturno = 0, heColaboradores = 0;
  let va = 0, vt = 0, vaNaoUtilizado = 0;
  let premioAssiduidade = 0, assiduidadeVip = 0;

  const custoPorCC = new Map(); // centro_custo -> { custo, colaboradores }
  const headcountPorCargo = new Map(); // cargo -> { colaboradores, custo }

  for (const e of colaboradores) {
    headcountPorStatus[e.status] = (headcountPorStatus[e.status] || 0) + 1;
    if (STATUS_AFASTAMENTO.includes(e.status)) afastadosTotal += 1;
    if (e.multi_cc) multiCC += 1;

    const adm = parseDataBr(e.admissao);
    if (adm && periodoInicio && periodoFim && adm >= periodoInicio && adm <= periodoFim) admissoesNoMes += 1;

    const t = e.totais || {};
    proventos += t.proventos || 0;
    descontos += t.descontos || 0;
    liquido += t.liquido || 0;
    inssBase += t.inss_base || 0;
    fgtsBase += t.fgts_base || 0;

    periculosidade += somaRubrica(e, COD.PERICULOSIDADE);
    insalubridade += somaRubrica(e, COD.INSALUBRIDADE);
    adicionalNoturno += somaRubrica(e, COD.ADICIONAL_NOTURNO);

    const he50e = somaRubrica(e, COD.HE_50);
    const he100e = somaRubrica(e, COD.HE_100);
    const he50Ne = somaRubrica(e, COD.HE_50_NOTURNO);
    if (he50e || he100e || he50Ne) heColaboradores += 1;
    he50 += he50e; he100 += he100e; he50Noturno += he50Ne;

    va += somaRubrica(e, COD.VA);
    vt += somaRubrica(e, COD.VT);
    vaNaoUtilizado += somaRubrica(e, COD.VA_NAO_UTILIZADO);
    premioAssiduidade += somaRubrica(e, COD.PREMIO_ASSIDUIDADE);
    assiduidadeVip += somaRubrica(e, COD.ASSIDUIDADE_VIP);

    const cc = e.centro_custo || '(sem centro de custo)';
    const ccAgg = custoPorCC.get(cc) || { centro_custo: cc, custo: 0, colaboradores: 0 };
    ccAgg.custo += t.proventos || 0;
    ccAgg.colaboradores += 1;
    custoPorCC.set(cc, ccAgg);

    const cargo = e.cargo || '(sem cargo)';
    const cgAgg = headcountPorCargo.get(cargo) || { cargo, colaboradores: 0, custo: 0 };
    cgAgg.custo += t.proventos || 0;
    cgAgg.colaboradores += 1;
    headcountPorCargo.set(cargo, cgAgg);
  }

  const ativos = headcountPorStatus['Trabalhando'] || 0;
  const demitidos = headcountPorStatus['Demitido'] || 0;
  const abandono = headcountPorStatus['Abandono'] || 0;

  return {
    colaboradores: colaboradores.length,
    headcountPorStatus: Object.entries(headcountPorStatus).map(([status, quantidade]) => ({ status, quantidade })),
    ativos,
    afastadosTotal,
    demitidos,
    abandono,
    admissoesNoMes,
    saidasNoMes: demitidos + abandono,
    multiCC,

    financeiro: {
      proventos, descontos, liquido,
      inssBase, fgtsBase,
      custoMedioPorColaborador: colaboradores.length ? proventos / colaboradores.length : 0,
    },

    adicionais: { periculosidade, insalubridade, adicionalNoturno },

    horasExtras: {
      valor50: he50, valor100: he100, valor50Noturno: he50Noturno,
      valorTotal: he50 + he100 + he50Noturno,
      colaboradoresComHE: heColaboradores,
    },

    beneficios: { va, vt, vaNaoUtilizado, premioAssiduidade, assiduidadeVip },

    topCentrosCusto: [...custoPorCC.values()].sort((a, b) => b.custo - a.custo).slice(0, 10),
    topCargosPorCusto: [...headcountPorCargo.values()].sort((a, b) => b.custo - a.custo).slice(0, 10),
    topCargosPorHeadcount: [...headcountPorCargo.values()].sort((a, b) => b.colaboradores - a.colaboradores).slice(0, 10),
  };
}

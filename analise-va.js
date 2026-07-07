// analise-va.js
// Recebe as linhas cruas de VA (últimos N meses, já filtradas por
// descrição de rubrica no backend) e faz o pente fino de verdade:
// duplicidade, VA pago a quem não deveria receber (demitido/afastado), e
// salto suspeito de valor mês a mês por colaborador. Tudo com base em dado
// real — nada aqui é estimativa.

const chaveOrdenavel = (comp) => { const [m, a] = comp.split('/'); return `${a}-${m.padStart(2, '0')}`; };

const STATUS_NAO_DEVERIA_RECEBER = ['Demitido', 'Abandono']; // afastamentos (auxílio/licença) ficam de fora — VA proporcional pode ser legítimo
const LIMIAR_SALTO = 1.6; // 60% acima da média dos meses anteriores do próprio colaborador

// Regra de negócio confirmada pelo Gabriel: o desconto na folha é uma
// PORCENTAGEM do valor do benefício, não um valor fixo — 1% pra maioria dos
// cargos, 20% pra Vigias/Vigilantes (provavelmente porque 20% é o teto
// legal de coparticipação do empregado no PAT - Programa de Alimentação do
// Trabalhador, e vigias estão nesse teto enquanto os demais têm subsídio
// bem maior da empresa). A partir do desconto, dá pra reconstruir o valor
// BRUTO real do benefício: bruto = desconto ÷ taxa.
function taxaDesconto(cargo) {
  return /vigia|vigilante/i.test(cargo || '') ? 0.20 : 0.01;
}

export function auditarValeAlimentacao(linhas) {
  const porColaborador = new Map();
  for (const l of linhas) {
    if (!porColaborador.has(l.matricula)) porColaborador.set(l.matricula, { ...l, linhas: [] });
    porColaborador.get(l.matricula).linhas.push(l);
  }

  const achados = [];
  let totalDescontoGeral = 0;
  let totalBrutoGeral = 0;
  const totalDescontoPorMes = new Map();
  const totalBrutoPorMes = new Map();
  const totalBrutoPorCentroCusto = new Map();
  const colaboradoresPorMes = new Map(); // Map<competencia, Set<matricula>>

  for (const colaborador of porColaborador.values()) {
    colaborador.linhas.sort((a, b) => chaveOrdenavel(a.competencia).localeCompare(chaveOrdenavel(b.competencia)));
    const taxa = taxaDesconto(colaborador.cargo);

    // Duplicidade: mesmo código de rubrica, mesma competência, mais de uma linha
    const porCompEve = new Map();
    for (const l of colaborador.linhas) {
      const valorBruto = l.valor / taxa;
      const chave = `${l.competencia}::${l.codEve}`;
      if (!porCompEve.has(chave)) porCompEve.set(chave, []);
      porCompEve.get(chave).push(l);
      totalDescontoGeral += l.valor;
      totalBrutoGeral += valorBruto;
      totalDescontoPorMes.set(l.competencia, (totalDescontoPorMes.get(l.competencia) || 0) + l.valor);
      totalBrutoPorMes.set(l.competencia, (totalBrutoPorMes.get(l.competencia) || 0) + valorBruto);
      totalBrutoPorCentroCusto.set(l.centroCusto, (totalBrutoPorCentroCusto.get(l.centroCusto) || 0) + valorBruto);
      if (!colaboradoresPorMes.has(l.competencia)) colaboradoresPorMes.set(l.competencia, new Set());
      colaboradoresPorMes.get(l.competencia).add(colaborador.matricula);
    }
    for (const grupo of porCompEve.values()) {
      if (grupo.length > 1) {
        achados.push({
          tipo: 'duplicidade', matricula: colaborador.matricula, nome: colaborador.nome, cargo: colaborador.cargo,
          centroCusto: colaborador.centroCusto, competencia: grupo[0].competencia, desRub: grupo[0].desRub,
          quantidadeLinhas: grupo.length, valorTotal: grupo.reduce((s, l) => s + l.valor, 0),
          confianca: 'alta',
        });
      }
    }

    // VA pago com status que não deveria receber (Demitido/Abandono)
    for (const l of colaborador.linhas) {
      if (STATUS_NAO_DEVERIA_RECEBER.some((s) => (colaborador.status || '').includes(s)) && l.valor > 0) {
        achados.push({
          tipo: 'pago_status_invalido', matricula: colaborador.matricula, nome: colaborador.nome, cargo: colaborador.cargo,
          centroCusto: colaborador.centroCusto, competencia: l.competencia, desRub: l.desRub, valor: l.valor,
          valorBruto: Math.round((l.valor / taxa) * 100) / 100,
          status: colaborador.status, confianca: 'alta',
        });
      }
    }

    // Salto suspeito: valor do mês atual >= LIMIAR_SALTO vezes a média dos
    // meses anteriores do PRÓPRIO colaborador (detecta mudança individual,
    // não sazonalidade do grupo todo). Compara sobre o valor BRUTO, já que
    // é o custo real que importa pra essa análise.
    const porMesColab = new Map();
    for (const l of colaborador.linhas) porMesColab.set(l.competencia, (porMesColab.get(l.competencia) || 0) + (l.valor / taxa));
    const mesesOrdenados = [...porMesColab.keys()].sort((a, b) => chaveOrdenavel(a).localeCompare(chaveOrdenavel(b)));
    for (let i = 1; i < mesesOrdenados.length; i++) {
      const anteriores = mesesOrdenados.slice(0, i).map((m) => porMesColab.get(m));
      const media = anteriores.reduce((s, v) => s + v, 0) / anteriores.length;
      const atual = porMesColab.get(mesesOrdenados[i]);
      if (media > 20 && atual > media * LIMIAR_SALTO) {
        achados.push({
          tipo: 'salto_suspeito', matricula: colaborador.matricula, nome: colaborador.nome, cargo: colaborador.cargo,
          centroCusto: colaborador.centroCusto, competencia: mesesOrdenados[i],
          valorAtual: Math.round(atual * 100) / 100, mediaAnterior: Math.round(media * 100) / 100,
          confianca: 'revisar',
        });
      }
    }
  }

  const serieMensal = [...totalBrutoPorMes.entries()].sort((a, b) => chaveOrdenavel(a[0]).localeCompare(chaveOrdenavel(b[0])))
    .map(([competencia, totalBruto]) => {
      const colaboradoresNoMes = colaboradoresPorMes.get(competencia)?.size || 0;
      const totalDesconto = totalDescontoPorMes.get(competencia) || 0;
      return {
        competencia,
        totalBruto: Math.round(totalBruto * 100) / 100,
        totalDesconto: Math.round(totalDesconto * 100) / 100,
        subsidioEmpresa: Math.round((totalBruto - totalDesconto) * 100) / 100,
        colaboradores: colaboradoresNoMes,
        mediaPorColaborador: colaboradoresNoMes ? Math.round((totalBruto / colaboradoresNoMes) * 100) / 100 : 0,
      };
    });
  const porCentroCusto = [...totalBrutoPorCentroCusto.entries()].sort((a, b) => b[1] - a[1])
    .map(([centroCusto, total]) => ({ centroCusto, total: Math.round(total * 100) / 100 }));

  const mediaGeralPorColaborador = serieMensal.length
    ? Math.round((serieMensal.reduce((s, m) => s + m.mediaPorColaborador, 0) / serieMensal.length) * 100) / 100
    : 0;

  return {
    totalDescontoGeral: Math.round(totalDescontoGeral * 100) / 100,
    totalBrutoGeral: Math.round(totalBrutoGeral * 100) / 100,
    totalSubsidioEmpresa: Math.round((totalBrutoGeral - totalDescontoGeral) * 100) / 100,
    mediaGeralPorColaborador,
    serieMensal, porCentroCusto,
    achados: achados.sort((a, b) => (b.valorTotal || b.valor || b.valorAtual || 0) - (a.valorTotal || a.valor || a.valorAtual || 0)),
  };
}

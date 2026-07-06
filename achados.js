// achados.js
// Transforma a lista bruta de exceções (uma linha por colaborador) em
// ACHADOS de auditoria (uma linha por causa raiz) — é isso que responde
// "336 exceções, e daí? o que eu faço?". Prática de auditoria trabalhista
// de verdade: materialidade (não afogar em centavos), agrupamento por causa
// raiz, reincidência (mesmo erro 2+ meses = falha sistêmica, não pontual),
// e o R$ em risco como métrica central — não a contagem de linhas.

// Abaixo disso, a diferença não move a agulha — é ruído de arredondamento,
// não erro de conferência. (Baseado no conceito de materialidade de
// auditoria: o objetivo é sinalizar o que influenciaria uma decisão.)
const MATERIALIDADE_RS = 5.00;
const MATERIALIDADE_HORAS = 1.0;
const REGEX_HORAS = /hora|dobra/i;

function normalizarRegra(regra) {
  // Remove números/percentuais/nomes de cargo específicos pra agrupar
  // ocorrências que são, na prática, a MESMA causa raiz.
  return (regra || '')
    .replace(/R\$\s?[\d.,]+/g, '#')
    .replace(/\d+([.,]\d+)?%?/g, '#')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function ehMaterial(item) {
  if (item.diferenca == null || Number.isNaN(item.diferenca)) return true; // sem valor numérico (ex: rubrica ausente) — sempre conta
  const abs = Math.abs(item.diferenca);
  const limiar = REGEX_HORAS.test(item.regra || '') && abs < 100 ? MATERIALIDADE_HORAS : MATERIALIDADE_RS;
  return abs >= limiar;
}

/**
 * @param {Array<{competencia, excecoes}>} meses - ordenado cronologicamente (do hook useTodasCompetencias)
 * @param {string} [competenciaAlvo] - competência a analisar; default é a última
 */
export function gerarAchados(meses, competenciaAlvo) {
  if (!meses || meses.length === 0) return null;
  const idxAlvo = competenciaAlvo ? meses.findIndex((m) => m.competencia === competenciaAlvo) : meses.length - 1;
  if (idxAlvo === -1) return null;
  const atual = meses[idxAlvo];
  const anterior = idxAlvo > 0 ? meses[idxAlvo - 1] : null;

  const chaveReinc = (tier, matricula, regra) => `${tier}|${matricula}|${normalizarRegra(regra)}`;
  const anteriorSet = new Set();
  if (anterior) {
    for (const [tier, arr] of Object.entries(anterior.excecoes || {})) {
      (arr || []).forEach((e) => { if (e) anteriorSet.add(chaveReinc(tier, e.matricula, e.regra)); });
    }
  }

  let totalItens = 0;
  let itensAbaixoMaterialidade = 0;
  let valorEmRisco = 0;
  const grupos = new Map();

  for (const [tier, arr] of Object.entries(atual.excecoes || {})) {
    for (const item of (arr || [])) {
      if (!item) continue;
      totalItens += 1;
      if (!ehMaterial(item)) { itensAbaixoMaterialidade += 1; continue; }

      if (item.confianca === 'alta' && typeof item.diferenca === 'number' && !REGEX_HORAS.test(item.regra || '')) {
        valorEmRisco += Math.abs(item.diferenca);
      }

      const chaveGrupo = `${tier}::${normalizarRegra(item.regra)}`;
      if (!grupos.has(chaveGrupo)) {
        grupos.set(chaveGrupo, { tier, regraExemplo: item.regra, itens: [], impactoTotal: 0, temAlta: false });
      }
      const g = grupos.get(chaveGrupo);
      const reincidente = anteriorSet.has(chaveReinc(tier, item.matricula, item.regra));
      g.itens.push({ ...item, reincidente });
      if (typeof item.diferenca === 'number') g.impactoTotal += Math.abs(item.diferenca);
      if (item.confianca === 'alta') g.temAlta = true;
    }
  }

  const achados = [...grupos.values()]
    .map((g) => ({
      tier: g.tier,
      regra: g.regraExemplo,
      quantidade: g.itens.length,
      impactoTotal: Math.round(g.impactoTotal * 100) / 100,
      reincidentes: g.itens.filter((i) => i.reincidente).length,
      confianca: g.temAlta ? 'alta' : 'revisar',
      itens: g.itens.sort((a, b) => Math.abs(b.diferenca || 0) - Math.abs(a.diferenca || 0)),
    }))
    .sort((a, b) => b.impactoTotal - a.impactoTotal || b.quantidade - a.quantidade);

  return {
    competencia: atual.competencia,
    totalItens,
    itensAbaixoMaterialidade,
    totalAposFiltro: totalItens - itensAbaixoMaterialidade,
    valorEmRisco: Math.round(valorEmRisco * 100) / 100,
    achados,
  };
}

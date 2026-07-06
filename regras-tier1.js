// regras-tier1.js
// Porta em JavaScript do Tier 1 do rule_engine.py (INSS / FGTS / VT).
// Testado linha a linha contra a saída em Python antes de entrar no app.

const INSS_FAIXAS_2026 = [
  [0, 1621.00, 0.075],
  [1621.00, 2902.84, 0.09],
  [2902.84, 4354.27, 0.12],
  [4354.27, 8475.55, 0.14],
];
const INSS_TETO = 8475.55;

export function inss2026(base) {
  base = Math.min(base, INSS_TETO);
  let total = 0;
  for (const [lo, hi, aliq] of INSS_FAIXAS_2026) {
    if (base > lo) total += (Math.min(base, hi) - lo) * aliq;
    else break;
  }
  return Math.round(total * 100) / 100;
}

// Diretor Administrativo em regime de pró-labore -- confirmado pelo RH em
// 02/07/2026. Excluído permanentemente do Tier 1 (não é CLT progressivo).
const CASOS_CONFIRMADOS_RH = new Set(['310001040']);

// Evento "Desc. Pagamento Indevido": correção retroativa de valor recebido
// a maior em mês anterior. Confirmado pelo RH em 02/07/2026 que NÃO deve
// reduzir a base de INSS/FGTS do mês corrente -- soma-se de volta antes
// de recalcular a tabela progressiva.
const EVENTO_AJUSTE_BASE = '2635';

const INSS_RELATED = new Set(['2000', '2002', '2004', '2006']); // mensal, férias, 13º, rescisão
const FGTS_RELATED = new Set(['2500', '1557', '1553']);

export function findRubrica(colaborador, cod) {
  return colaborador.rubricas.find((r) => r.cod === cod) || null;
}

function cleanSingleBucket(colaborador, codigos) {
  const achados = colaborador.rubricas.filter((r) => codigos.has(r.cod));
  return achados.length === 1;
}

export function fullMonth(colaborador, periodoInicio) {
  if (colaborador.status !== 'Trabalhando') return false;
  const [dia, mes, ano] = (colaborador.admissao || '').split('/').map(Number);
  if (!dia || !mes || !ano) return false;
  const admissao = new Date(ano, mes - 1, dia);
  return admissao < periodoInicio;
}

/**
 * @param {Array} colaboradores  - lista de colaboradores no formato do parser
 * @param {Date}   periodoInicio - primeiro dia da competência (ex: new Date(2026,5,1) p/ junho)
 * @param {string} competencia   - rótulo, ex: "06/2026"
 * @returns {Array} lista de exceções, mesmo formato do rule_engine.py
 */
export function tier1Legal(colaboradores, periodoInicio, competencia) {
  const out = [];

  for (const e of colaboradores) {
    if (CASOS_CONFIRMADOS_RH.has(e.matricula)) continue;
    const baseConfianca = fullMonth(e, periodoInicio);

    // --- INSS ---
    const inssBase = e.totais?.inss_base;
    const rInss = findRubrica(e, '2000');
    if (inssBase && rInss) {
      const rAjuste = findRubrica(e, EVENTO_AJUSTE_BASE);
      const inssBaseAjustada = inssBase + (rAjuste ? rAjuste.valor : 0);
      const confianca = (baseConfianca && cleanSingleBucket(e, INSS_RELATED))
        ? 'alta' : 'revisar (férias/13º/rescisão no período)';
      const exp = inss2026(inssBaseAjustada);
      const diff = Math.round((rInss.valor - exp) * 100) / 100;
      if (Math.abs(diff) > 0.10) {
        out.push({
          competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo,
          centro_custo: e.centro_custo, regra: 'INSS (tabela progressiva 2026)',
          esperado: exp, lancado: rInss.valor, diferenca: diff, confianca,
          obs: 'Diferença vs tabela oficial INSS 2026 sobre base declarada',
        });
      }
    }

    // --- FGTS ---
    const fgtsBase = e.totais?.fgts_base;
    const rFgts = findRubrica(e, '2500');
    if (fgtsBase && rFgts) {
      const rAjuste = findRubrica(e, EVENTO_AJUSTE_BASE);
      const fgtsBaseAjustada = fgtsBase + (rAjuste ? rAjuste.valor : 0);
      const confianca = (baseConfianca && cleanSingleBucket(e, FGTS_RELATED))
        ? 'alta' : 'revisar (férias/13º/rescisão no período)';
      const exp = Math.round(fgtsBaseAjustada * 0.08 * 100) / 100;
      const diff = Math.round((rFgts.valor - exp) * 100) / 100;
      if (Math.abs(diff) > 0.10) {
        out.push({
          competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo,
          centro_custo: e.centro_custo, regra: 'FGTS (8% flat)',
          esperado: exp, lancado: rFgts.valor, diferenca: diff, confianca,
          obs: 'Diferença vs 8% da base de FGTS declarada',
        });
      }
    }

    // --- Vale Transporte: teto legal de 6% (não se aplica a horistas) ---
    const rVt = findRubrica(e, '2453');
    const cargoLower = (e.cargo || '').toLowerCase();
    if (rVt && e.salario_base && !cargoLower.includes('horista')) {
      const cap = Math.round(e.salario_base * 0.06 * 100) / 100;
      if (rVt.valor > cap + 0.10) {
        out.push({
          competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo,
          centro_custo: e.centro_custo, regra: 'VT acima do teto legal 6%',
          esperado: cap, lancado: rVt.valor, diferenca: Math.round((rVt.valor - cap) * 100) / 100,
          confianca: 'alta',
          obs: 'Desconto de Vale Transporte ultrapassa o teto legal de 6% do salário base',
        });
      }
    }
  }

  return out;
}

// regras-tier1c.js
// Porta em JavaScript da regra Tier 1c do rule_engine.py (Periculosidade /
// Insalubridade — CCT Asseio e Conservação, registro Mediador/MTE
// SC000102/2026 São José, SC000124/2026 Florianópolis, SC000101/2026 Itajaí).
//
// Os percentuais (30% periculosidade, 20% insalubridade grau médio) são
// idênticos nas três regiões — só o piso-base regional muda (checado à
// parte na regra de Piso Regional). Por isso essa regra funciona igual
// para os três centros de custo.
//
// Regra: adicional esperado = percentual × salário base do colaborador.
// Confiança "alta" só quando (a) mês completo e (b) a referência de horas
// da rubrica do adicional bate com a referência de Horas Normais (cod '1')
// do mesmo mês — ou seja, nenhum evento (falta, atestado, férias, admissão/
// rescisão no meio do mês, multi-centro de custo) bagunçou a base de
// cálculo. Fora desse recorte "limpo", o caso fica pro Tier 2 (estatístico)
// até termos o cruzamento com histórico de afastamentos.

import { findRubrica, fullMonth } from './regras-tier1.js';

// (palavras-chave no cargo, código da rubrica, percentual, cláusula da CCT)
const CCT_ADICIONAIS = [
  { keywords: ['zelador'], cod: '1952', pct: 0.30, clausula: 'Periculosidade 30% - CCT Asseio, item X' },
  { keywords: ['oficial de manutenção', 'oficial de manutencao'], cod: '1952', pct: 0.30, clausula: 'Periculosidade 30% - CCT Asseio, item Z' },
  { keywords: ['asg', 'auxiliar de serviços gerais', 'auxiliar de servicos gerais', 'servente'], cod: '1951', pct: 0.20, clausula: 'Insalubridade grau médio 20% - CCT Asseio, item Q / Cláusula 9ª' },
  { keywords: ['lider de grupo', 'líder de grupo'], cod: '1951', pct: 0.20, clausula: 'Insalubridade grau médio 20% - CCT Asseio, item B' },
  { keywords: ['encarregado'], cod: '1951', pct: 0.20, clausula: 'Insalubridade grau médio 20% - CCT Asseio, item C/D/E' },
];

const HORAS_NORMAIS_COD = '1';

/**
 * @param {Array}  colaboradores  - lista de colaboradores no formato do parser
 * @param {Date}   periodoInicio  - primeiro dia da competência
 * @param {string} competencia    - rótulo, ex: "06/2026"
 * @returns {Array} lista de exceções, mesmo formato do rule_engine.py
 */
export function tier1cCct(colaboradores, periodoInicio, competencia) {
  const out = [];

  for (const e of colaboradores) {
    if (!e.salario_base) continue;
    const cargoLower = (e.cargo || '').toLowerCase();

    const regra = CCT_ADICIONAIS.find((r) => r.keywords.some((k) => cargoLower.includes(k)));
    if (!regra) continue;

    const rAdicional = findRubrica(e, regra.cod);
    const rHorasNormais = findRubrica(e, HORAS_NORMAIS_COD);
    if (!rAdicional || !rHorasNormais) continue;

    // Base "limpa": mês completo e a referência de horas do adicional bate
    // com a referência de Horas Normais — sem falta/atestado/férias/
    // admissão-rescisão no meio do mês/multi-centro de custo bagunçando.
    const baseLimpa = fullMonth(e, periodoInicio)
      && rAdicional.referencia != null
      && rAdicional.referencia === rHorasNormais.referencia;

    if (!baseLimpa) continue; // fora do recorte limpo -> fica no Tier 2 (estatístico)

    const esperado = Math.round(regra.pct * e.salario_base * 100) / 100;
    const diff = Math.round((rAdicional.valor - esperado) * 100) / 100;

    // Tolerância de 2% (ou R$2, o que for maior) para absorver arredondamento.
    const tolerancia = Math.max(esperado * 0.02, 2.00);
    if (Math.abs(diff) > tolerancia) {
      out.push({
        competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo,
        centro_custo: e.centro_custo, regra: regra.clausula,
        esperado, lancado: rAdicional.valor, diferenca: diff, confianca: 'alta',
        obs: 'Diferença vs percentual fixo da CCT sobre o salário base (base limpa: mês completo, sem falta/férias/multi-CC)',
      });
    }
  }

  return out;
}

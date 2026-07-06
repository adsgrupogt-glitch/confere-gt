// regras-tier1d.js
// CCT do Vigia (SC000253/2026): piso salarial mínimo de R$2.020,33
// (Cláusula 3ª) e proibição expressa de adicional de periculosidade
// ("Ao VIGIA, pela natureza de sua função, não é devido o adicional de
// periculosidade" — Cláusula 3ª, §4º).

const VIGIA_PISO = 2020.33;
const COD_PERICULOSIDADE = '1952';

export function tier1dVigia(colaboradores, competencia) {
  const out = [];
  for (const e of colaboradores) {
    if (!/vigia/i.test(e.cargo || '')) continue;

    if (e.salario_base && e.salario_base < VIGIA_PISO - 0.02) {
      out.push({
        competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo, centro_custo: e.centro_custo,
        regra: 'Salário base abaixo do piso da CCT do Vigia (SC000253/2026, Cláusula 3ª)',
        esperado: VIGIA_PISO, lancado: e.salario_base, diferenca: e.salario_base - VIGIA_PISO,
        confianca: 'alta', obs: 'Piso R$2.020,33 vigente — checar se não é regime de jornada reduzida (piso proporcional).',
      });
    }

    const periculosidade = e.rubricas.find((r) => r.cod === COD_PERICULOSIDADE);
    if (periculosidade && periculosidade.valor > 0) {
      out.push({
        competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo, centro_custo: e.centro_custo,
        regra: 'Periculosidade paga a colaborador Vigia — CCT proíbe expressamente (Cláusula 3ª, §4º)',
        esperado: 0, lancado: periculosidade.valor, diferenca: periculosidade.valor,
        confianca: 'alta', obs: 'Ao Vigia não é devido adicional de periculosidade pela natureza da função.',
      });
    }
  }
  return out;
}

// regras-tier2.js
// Rede de segurança estatística: para Periculosidade, Insalubridade,
// Adicional Noturno e Horas Normais Noturnas, calcula a taxa (valor ÷ horas
// de referência) de cada colaborador e compara à MEDIANA do próprio cargo.
// Também aponta quando a rubrica existe para a maioria do cargo mas falta
// num colaborador específico. Não afirma erro — sinaliza desvio do padrão
// do grupo para revisão humana. É o que cobre os casos que ficam fora do
// recorte "limpo" do Tier 1c/1d/1e (mês com falta/férias/multi-CC etc.).

const RUBRICAS_CHECADAS = [
  { cod: '1952', nome: 'Periculosidade' },
  { cod: '1951', nome: 'Insalubridade' },
  { cod: '1950', nome: 'Adicional Noturno' },
  { cod: '2520', nome: 'Horas Normais Noturnas' },
];

const TOLERANCIA_PCT = 0.10; // 10% de desvio da mediana do cargo

function mediana(valores) {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

export function tier2ConsistenciaPares(colaboradores, competencia) {
  const out = [];

  for (const { cod, nome: nomeRubrica } of RUBRICAS_CHECADAS) {
    // Agrupa por cargo: taxa (valor/referencia) de quem tem a rubrica, e
    // contagem de quem está no cargo (pra saber se é "maioria")
    const porCargo = new Map(); // cargo -> { taxas: [], comRubrica: Set(matricula), todos: Set(matricula) }
    for (const e of colaboradores) {
      if (e.status !== 'Trabalhando' || e.multi_cc) continue; // só o recorte limpo
      const cargo = e.cargo || '(sem cargo)';
      if (!porCargo.has(cargo)) porCargo.set(cargo, { taxas: [], comRubrica: new Set(), todos: new Set() });
      const g = porCargo.get(cargo);
      g.todos.add(e.matricula);
      const r = e.rubricas.find((x) => x.cod === cod);
      if (r && r.referencia > 0 && r.valor > 0) {
        g.taxas.push({ matricula: e.matricula, taxa: r.valor / r.referencia, valor: r.valor });
        g.comRubrica.add(e.matricula);
      }
    }

    for (const [cargo, g] of porCargo.entries()) {
      if (g.taxas.length < 3) continue; // amostra pequena demais pra estatística fazer sentido
      const med = mediana(g.taxas.map((t) => t.taxa));
      if (!med) continue;

      for (const { matricula, taxa, valor } of g.taxas) {
        const desvio = (taxa - med) / med;
        if (Math.abs(desvio) > TOLERANCIA_PCT) {
          const e = colaboradores.find((x) => x.matricula === matricula);
          out.push({
            competencia, matricula, nome: e.nome, cargo: e.cargo, centro_custo: e.centro_custo,
            regra: `${nomeRubrica}: taxa por hora ${desvio > 0 ? 'acima' : 'abaixo'} da mediana do cargo em ${(Math.abs(desvio) * 100).toFixed(0)}%`,
            esperado: Math.round(med * (valor / taxa) * 100) / 100, lancado: valor,
            diferenca: Math.round((valor - med * (valor / taxa)) * 100) / 100,
            confianca: 'revisar',
            obs: `Mediana do cargo "${cargo}" (${g.taxas.length} colaboradores na amostra): R$${med.toFixed(2)}/h.`,
          });
        }
      }

      // Maioria do cargo tem a rubrica, mas falta pra alguém específico
      if (g.comRubrica.size / g.todos.size > 0.6) {
        for (const matricula of g.todos) {
          if (!g.comRubrica.has(matricula)) {
            const e = colaboradores.find((x) => x.matricula === matricula);
            out.push({
              competencia, matricula, nome: e.nome, cargo: e.cargo, centro_custo: e.centro_custo,
              regra: `${nomeRubrica} presente em ${g.comRubrica.size} de ${g.todos.size} colaboradores do cargo "${cargo}", mas ausente neste`,
              esperado: null, lancado: 0, diferenca: null,
              confianca: 'revisar', obs: 'Verificar se é isenção legítima (ex: função administrativa dentro do mesmo título de cargo) ou lançamento faltando.',
            });
          }
        }
      }
    }
  }
  return out;
}

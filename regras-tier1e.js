// regras-tier1e.js
// Piso salarial mínimo por região (CCT Asseio São José/Florianópolis/Itajaí)
// para os cargos mais numerosos, jornada 44hs (jornadas reduzidas têm piso
// proporcional — não comparável direto, por isso ficam fora desta checagem).
//
// A região de cada colaborador não vem explícita na folha — é inferida pela
// rubrica de contribuição sindical (TSL), que aparece nos próprios
// lançamentos de cada um.

const TSL_POR_REGIAO = {
  '2646': 'São José', '281': 'São José', '2639': 'São José',
  '2647': 'Florianópolis', '282': 'Florianópolis', '2638': 'Florianópolis',
  '2649': 'Itajaí',
};

const PISO_REGIONAL = {
  'São José':       { zelador: 1977.73, 'oficial de manutenção': 1977.73, asg: 1752.85, servente: 1752.85, porteiro: 2496.27 },
  'Florianópolis':  { zelador: 1977.73, 'oficial de manutenção': 1977.73, asg: 1752.85, servente: 1752.85, porteiro: 2496.27 },
  'Itajaí':         { zelador: 1926.86, 'oficial de manutenção': 1926.86, asg: 1707.75, servente: 1707.75, porteiro: 2432.05 },
};

function regiaoDoColaborador(colaborador) {
  for (const r of colaborador.rubricas) {
    if (TSL_POR_REGIAO[r.cod]) return TSL_POR_REGIAO[r.cod];
  }
  return null;
}

function cargoBase(cargoLower) {
  return Object.keys(PISO_REGIONAL['São José']).find((k) => cargoLower.includes(k));
}

export function tier1ePisoRegional(colaboradores, competencia) {
  const out = [];
  for (const e of colaboradores) {
    if (!e.salario_base) continue;
    const cargoLower = (e.cargo || '').toLowerCase();
    if (!cargoLower.includes('44hs')) continue; // só jornada cheia — reduzida é proporcional

    const cargo = cargoBase(cargoLower);
    if (!cargo) continue;

    const regiao = regiaoDoColaborador(e);
    if (!regiao) continue;

    const piso = PISO_REGIONAL[regiao][cargo];
    if (e.salario_base < piso - 0.02) {
      out.push({
        competencia, matricula: e.matricula, nome: e.nome, cargo: e.cargo, centro_custo: e.centro_custo,
        regra: `Salário base abaixo do piso regional (${regiao}) para ${cargo}`,
        esperado: piso, lancado: e.salario_base, diferenca: e.salario_base - piso,
        confianca: 'alta', obs: `Piso identificado via rubrica de contribuição sindical (região: ${regiao}).`,
      });
    }
  }
  return out;
}

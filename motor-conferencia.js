// motor-conferencia.js
// A lógica de "rodar uma conferência" extraída do UploadScreen pra ser
// compartilhada por dois caminhos:
//   1. Sincronização automática (Dashboard, em segundo plano, sem clique)
//   2. Upload manual de PDF (fallback — empresas sem Vetorh, ou quando o
//      backend está fora do ar)
//
// Não inclui Tier 5/6/7 (Horas Extras/Dobras/Férias) quando rodado via
// Vetorh, porque essas dependem de PDFs específicos (ponto, recibos de
// férias) que não vêm do banco ainda — ficam disponíveis só no caminho
// manual, por enquanto.

import { tier1Legal } from './regras-tier1';
import { tier1cCct } from './regras-tier1c';
import { tier1dVigia } from './regras-tier1d';
import { tier1ePisoRegional } from './regras-tier1e';
import { tier2ConsistenciaPares } from './regras-tier2';
import { tier5HorasExtras } from './regras-tier5';
import { tier6Dobras } from './regras-tier6';
import { calcularAnalytics } from './analytics';
import { salvarResumoCompetencia, salvarExcecoes, salvarTiers, salvarAnalytics, salvarColaboradoresResumo, registrarAtividade } from './dados';

/**
 * Roda o motor de regras completo sobre uma lista de colaboradores já no
 * formato padrão (venha do PDF ou do Vetorh) e salva tudo no Firebase,
 * escopado por empresa.
 *
 * @param {number} numEmp
 * @param {string} competencia - "MM/AAAA"
 * @param {Array} colaboradores
 * @param {object} opcoes
 * @param {Record<string,object>|null} opcoes.pontoPorMatricula - saída do parseHorasExtras (opcional)
 * @param {Array} opcoes.excecoesT7 - já calculadas fora (Tier 7, opcional)
 * @param {string} opcoes.fonte - 'vetorh' | 'pdf'
 * @param {string} opcoes.origemLabel - texto pra linha do tempo (ex: "sincronização automática")
 * @param {boolean} opcoes.sobrescrita - true se está sobrescrevendo uma competência fechada
 * @param {string} opcoes.nomeUsuario
 */
export async function rodarEConfirmarConferencia(numEmp, competencia, colaboradores, opcoes = {}) {
  const { pontoPorMatricula = null, excecoesT7 = [], fonte = 'vetorh', origemLabel, sobrescrita = false, nomeUsuario = 'sistema' } = opcoes;

  const [mesStr, anoStr] = competencia.split('/');
  const periodoInicio = new Date(parseInt(anoStr, 10), parseInt(mesStr, 10) - 1, 1);
  const periodoFim = new Date(parseInt(anoStr, 10), parseInt(mesStr, 10), 0);

  const excecoesT1 = tier1Legal(colaboradores, periodoInicio, competencia);
  const excecoesT1c = tier1cCct(colaboradores, periodoInicio, competencia);
  const excecoesT1d = tier1dVigia(colaboradores, competencia);
  const excecoesT1e = tier1ePisoRegional(colaboradores, competencia);
  const excecoesT2 = tier2ConsistenciaPares(colaboradores, competencia);
  const colaboradoresPorMatricula = Object.fromEntries(colaboradores.map((e) => [e.matricula, e]));
  const excecoesT5 = pontoPorMatricula ? tier5HorasExtras(colaboradores, pontoPorMatricula, competencia) : [];
  const excecoesT6 = pontoPorMatricula ? tier6Dobras(pontoPorMatricula, colaboradoresPorMatricula, competencia) : [];

  const todasExcecoes = { t1: excecoesT1, t1c: excecoesT1c, t1d: excecoesT1d, t1e: excecoesT1e, t2: excecoesT2, t5: excecoesT5, t6: excecoesT6, t7: excecoesT7 };
  const alta = Object.values(todasExcecoes).reduce((s, arr) => s + arr.filter((x) => x.confianca === 'alta').length, 0);
  const totalExcecoes = Object.values(todasExcecoes).reduce((s, arr) => s + arr.length, 0);
  const analytics = calcularAnalytics(colaboradores, periodoInicio, periodoFim);

  const proventos = colaboradores.reduce((s, e) => s + (e.totais.proventos || 0), 0);
  const descontos = colaboradores.reduce((s, e) => s + (e.totais.descontos || 0), 0);
  const liquido = colaboradores.reduce((s, e) => s + (e.totais.liquido || 0), 0);

  await salvarResumoCompetencia(numEmp, competencia, {
    status: 'em_conferencia', colaboradores: colaboradores.length, proventos, descontos, liquido,
    temHorasExtras: !!pontoPorMatricula, fonte, sincronizadoEm: new Date().toISOString(),
  });

  const tiersParaSalvar = {};
  for (const [tier, arr] of Object.entries(todasExcecoes)) {
    await salvarExcecoes(numEmp, competencia, tier, arr);
    tiersParaSalvar[tier] = { total: arr.length, alta: arr.filter((x) => x.confianca === 'alta').length };
  }
  await salvarTiers(numEmp, competencia, tiersParaSalvar);
  await salvarAnalytics(numEmp, competencia, analytics);

  const colaboradoresResumo = {};
  for (const e of colaboradores) {
    colaboradoresResumo[e.matricula] = {
      nome: e.nome, cargo: e.cargo, cc: e.centro_custo, status: e.status,
      admissao: e.admissao, proventos: e.totais.proventos || 0, multiCC: !!e.multi_cc,
    };
  }
  await salvarColaboradoresResumo(numEmp, competencia, colaboradoresResumo);

  await registrarAtividade(
    (sobrescrita ? `⚠ Competência fechada ${competencia} foi SOBRESCRITA por ${nomeUsuario}. ` : `${origemLabel || 'Conferência'} de ${competencia} `)
    + `${colaboradores.length} colaboradores, ${totalExcecoes} exceções em ${Object.keys(todasExcecoes).length} camadas`
    + (pontoPorMatricula ? ' (com cruzamento de ponto/horas extras)' : '')
    + ` (${alta} de alta confiança no total).`,
    sobrescrita ? 'alerta' : (alta > 0 ? 'alerta' : 'resolvido')
  );

  return { colaboradores: colaboradores.length, proventos, liquido, excecoes: totalExcecoes, alta, comHE: !!pontoPorMatricula };
}

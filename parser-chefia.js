// parser-chefia.js
// Porta em JS da lógica validada em Python para extrair a estrutura
// organizacional a partir do "Relatório de Chefia" (FPRE120 do Senior/Rubi):
// um snapshot no formato CHEFIA > Local > colaboradores.
//
// O que extraímos daqui NÃO é usado como fonte de verdade de colaborador
// (isso vem sempre da folha real) — é só o vínculo Local/Posto -> Chefia,
// que a folha não tem. Por isso o cruzamento com a folha é feito pelo nome
// do centro de custo (normalizado), não por matrícula: assim cobre também
// quem já saiu antes deste snapshot ser gerado.

// Buckets administrativos do Depto. Pessoal (ex: "RG Servicos - Volantes
// (Rescisão)") não são chefias de campo — são gaveta de trânsito de gente
// sendo desligada, em abandono, em estabilidade gestante ou inativa.
// Detectamos isso pelo padrão do nome do Local, não pelo nome da chefia,
// pra não depender de "quem" está responsável por essa gaveta hoje.
const PADRAO_LOCAL_ADMINISTRATIVO = /volantes.*(abandono|gr[aá]vidas?|inativos|rescis)/i;

function normalizar(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * @param {string} texto - saída de extrairTextoLayout() sobre o PDF do Relatório de Chefia
 * @returns {{
 *   localParaChefia: Record<string,string>,   // local normalizado -> nome da chefia
 *   locaisPorChefia: Record<string,string[]>, // nome da chefia -> locais (nome original)
 *   chefiasAdministrativas: string[],         // chefias que são 100% bucket administrativo
 *   totalChefias: number, totalLocais: number,
 * }}
 */
export function parseRelatorioChefia(texto) {
  const linhas = texto.split('\n');
  let chefiaAtual = null;
  const localParaChefia = {};
  const locaisPorChefia = {};

  // Código do posto no relatório, ex: "1.30.01.0368.001.001" — marcador fixo
  // que aparece logo depois do nome do Local, independente de espaçamento.
  const CODIGO_POSTO_RE = /\d\.\d{2}\.\d{2}\.\d{4}\.\d{3}\.\d{3}/;

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.replace(/^\s+/, '');
    const mChefia = /^CHEFIA:\s*(.+?)\s*Telefone:/.exec(linha);
    if (mChefia) {
      chefiaAtual = mChefia[1].trim();
      if (!locaisPorChefia[chefiaAtual]) locaisPorChefia[chefiaAtual] = [];
      continue;
    }
    if (!linha.startsWith('Local:')) continue;
    const semPrefixo = linha.slice('Local:'.length).trim();
    const mCodigo = CODIGO_POSTO_RE.exec(semPrefixo);
    const nomeLocal = (mCodigo ? semPrefixo.slice(0, mCodigo.index) : semPrefixo.split('Gestor:')[0]).trim();
    if (nomeLocal && chefiaAtual) {
      localParaChefia[normalizar(nomeLocal)] = chefiaAtual;
      locaisPorChefia[chefiaAtual].push(nomeLocal);
    }
  }

  const chefiasAdministrativas = Object.entries(locaisPorChefia)
    .filter(([, locais]) => locais.length > 0 && locais.every((l) => PADRAO_LOCAL_ADMINISTRATIVO.test(l)))
    .map(([chefia]) => chefia);

  if (Object.keys(locaisPorChefia).length === 0) {
    throw new Error('Não consegui reconhecer nenhuma "CHEFIA:" neste PDF — confirma se é o Relatório de Chefia (FPRE120) do Senior/Rubi.');
  }

  return {
    localParaChefia,
    locaisPorChefia,
    chefiasAdministrativas,
    totalChefias: Object.keys(locaisPorChefia).length,
    totalLocais: Object.keys(localParaChefia).length,
  };
}

/** Remove o código numérico inicial do centro de custo da folha ("10001 Cond. X" -> "cond. x") pra bater com o nome do Local do relatório de Chefia. */
export function normalizarCentroCusto(cc) {
  if (!cc) return null;
  return normalizar(cc.replace(/^\d+\s+/, ''));
}

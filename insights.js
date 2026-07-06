// insights.js
// Motor de alertas do Dashboard: olha a série histórica (analytics + tiers
// por competência) e a estrutura de Chefias, e gera achados priorizados —
// o que um auditor sênior destacaria numa reunião de fechamento, sem
// precisar caçar número por número nas telas.
//
// Cada alerta: { nivel: 'critico'|'atencao'|'info'|'positivo', titulo, detalhe }
// Regras são thresholds explícitos e documentados — nada de "IA misteriosa".

function variacaoPct(atual, anterior) {
  if (anterior == null || anterior === 0 || atual == null) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function gerarAlertas(meses, cruzChefias) {
  const alertas = [];
  if (!meses || meses.length === 0) return alertas;

  const atual = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;
  const a = atual.analytics;
  const aAnt = anterior?.analytics;
  const t = atual.tiers || {};

  // --- Custo médio por colaborador ---
  if (a && aAnt) {
    const custoAtual = a.financeiro?.custoMedioPorColaborador;
    const custoAnt = aAnt.financeiro?.custoMedioPorColaborador;
    const delta = variacaoPct(custoAtual, custoAnt);
    if (delta != null && Math.abs(delta) >= 5) {
      alertas.push({
        nivel: Math.abs(delta) >= 10 ? 'critico' : 'atencao',
        titulo: `Custo médio por colaborador ${delta > 0 ? 'subiu' : 'caiu'} ${Math.abs(delta).toFixed(1)}% vs ${anterior.competencia}`,
        detalhe: `${fmtBRLLocal(custoAnt)} → ${fmtBRLLocal(custoAtual)} em ${atual.competencia}. Vale entender se é dissídio, mudança de mix de cargos ou pico de rescisão/13º.`,
      });
    }
  }

  // --- Headcount ativo em queda ---
  if (a && aAnt && a.ativos != null && aAnt.ativos != null) {
    const delta = a.ativos - aAnt.ativos;
    if (delta <= -15) {
      alertas.push({ nivel: 'critico', titulo: `Headcount ativo caiu ${Math.abs(delta)} colaboradores vs ${anterior.competencia}`, detalhe: `De ${aAnt.ativos} para ${a.ativos} — checar se é sazonalidade de contrato ou perda de cliente.` });
    }
  }

  // --- Taxa de exceção de alta confiança ---
  if (a?.colaboradores) {
    const alta = Object.values(t).reduce((s, x) => s + (x.alta || 0), 0);
    const pct = (alta / a.colaboradores) * 100;
    if (pct >= 15) alertas.push({ nivel: 'critico', titulo: `${pct.toFixed(1)}% da folha de ${atual.competencia} tem exceção de alta confiança aberta`, detalhe: `${alta} de ${a.colaboradores} colaboradores. Prioridade de revisão antes de fechar a competência.` });
    else if (pct >= 5) alertas.push({ nivel: 'atencao', titulo: `${pct.toFixed(1)}% da folha com exceção de alta confiança`, detalhe: `${alta} colaboradores — dentro do que já vinha acontecendo, mas vale acompanhar.` });
  }

  // --- Multi centro de custo (qualidade de rateio) ---
  if (a?.multiCC > 50) {
    alertas.push({ nivel: 'atencao', titulo: `${a.multiCC} colaboradores em mais de um centro de custo em ${atual.competencia}`, detalhe: 'Checar rateio de custo entre postos antes de fechar — pode distorcer o custo por Chefia/cliente.' });
  }

  // --- Horas extras em alta ---
  if (a && aAnt) {
    const delta = variacaoPct(a.horasExtras?.valorTotal, aAnt.horasExtras?.valorTotal);
    if (delta != null && delta >= 20) {
      alertas.push({ nivel: 'atencao', titulo: `Horas extras subiram ${delta.toFixed(0)}% vs ${anterior.competencia}`, detalhe: `${fmtBRLLocal(aAnt.horasExtras.valorTotal)} → ${fmtBRLLocal(a.horasExtras.valorTotal)}. Recorrência pode indicar quadro subdimensionado em algum posto.` });
    }
  }

  // --- Competência aberta há muito tempo ---
  const abertas = meses.filter((m) => m.resumo?.status !== 'fechada');
  if (abertas.length >= 3) {
    alertas.push({ nivel: 'atencao', titulo: `${abertas.length} competências ainda em conferência (não fechadas)`, detalhe: `${abertas.map((m) => m.competencia).join(', ')}. Feche as que já foram revisadas pra manter o histórico auditável limpo.` });
  }

  // --- Chefias: turnover e pipeline administrativo ---
  if (cruzChefias) {
    const pior = [...cruzChefias.ranking].sort((x, y) =>
      ((y.demissoes + y.abandono) / Math.max(y.headcountAtual, 1)) - ((x.demissoes + x.abandono) / Math.max(x.headcountAtual, 1)))[0];
    if (pior) {
      const turnover = ((pior.demissoes + pior.abandono) / Math.max(pior.headcountAtual, 1)) * 100;
      if (turnover >= 15) {
        alertas.push({ nivel: 'atencao', titulo: `${pior.chefia}: turnover de ${turnover.toFixed(0)}% no semestre`, detalhe: `${pior.demissoes} demissões + ${pior.abandono} abandonos em uma equipe de ${pior.headcountAtual}. Vale uma conversa direta.` });
      }
    }
    if (cruzChefias.pipelineAdministrativo.length > 0) {
      const totalPipeline = cruzChefias.pipelineAdministrativo.reduce((s, p) => s + p.headcountAtual, 0);
      if (totalPipeline > 0) {
        alertas.push({ nivel: 'info', titulo: `${totalPipeline} colaborador(es) no pipeline administrativo agora`, detalhe: 'Em processo de desligamento, abandono, estabilidade gestante ou inatividade — acompanhar prazo de cada caso.' });
      }
    }
    if (cruzChefias.semCorrespondencia.length > 0) {
      alertas.push({ nivel: 'info', titulo: `${cruzChefias.semCorrespondencia.length} centros de custo sem Chefia mapeada`, detalhe: 'Provável diferença de grafia entre a folha e o Relatório de Chefia — ver aba "Chefias & Estrutura".' });
    }
  }

  // --- Positivo: VT sempre em conformidade (regra determinística já cobre 100%) ---
  const semExcecaoVT = meses.every((m) => {
    const t1 = (m.excecoes?.t1 || []).filter(Boolean);
    return !t1.some((e) => e.regra?.includes('VT'));
  });
  if (semExcecaoVT && meses.length >= 3) {
    alertas.push({ nivel: 'positivo', titulo: 'Vale Transporte 100% em conformidade no período', detalhe: `Nenhuma exceção de teto legal (6%) em ${meses.length} competências — motor de conferência cobrindo isso sozinho.` });
  }

  const ordemNivel = { critico: 0, atencao: 1, info: 2, positivo: 3 };
  return alertas.sort((x, y) => ordemNivel[x.nivel] - ordemNivel[y.nivel]);
}

function fmtBRLLocal(v) {
  return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

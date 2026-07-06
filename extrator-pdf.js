// extrator-pdf.js
// Extrai texto de um PDF reconstruindo o "layout" (colunas alinhadas por
// espaço), do mesmo jeito que o pdftotext -layout fazia no protótipo Python.
// Usa pdfjs-dist, que roda no navegador (é a mesma engine do PDF do Firefox).

import * as pdfjsLib from 'pdfjs-dist';

// O pdf.js roda a leitura pesada num "worker" (thread separada, pra não travar
// a tela). Aponta pro arquivo local (copiado pelo build.js a partir de
// node_modules/pdfjs-dist) — servido junto do index.html, sem depender de
// nenhum CDN externo em tempo de execução.
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

export async function extrairTextoLayout(arrayBuffer, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const larguraChar = 4.6; // largura média de caractere no relatório (fonte ~8-9pt)
  const TOLERANCIA_Y = 2;  // funde itens que deveriam estar na mesma linha mas
                            // saíram com um Y ligeiramente diferente (baseline)
  const paginas = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const itensOrdenados = [...content.items].sort((a, b) => b.transform[5] - a.transform[5]);
    const linhasAgrupadas = [];
    for (const item of itensOrdenados) {
      const y = item.transform[5];
      let linhaAtual = linhasAgrupadas[linhasAgrupadas.length - 1];
      if (!linhaAtual || Math.abs(linhaAtual.y - y) > TOLERANCIA_Y) {
        linhaAtual = { y, itens: [] };
        linhasAgrupadas.push(linhaAtual);
      }
      linhaAtual.itens.push(item);
    }

    const textoPagina = linhasAgrupadas.map(({ itens }) => {
      itens.sort((a, b) => a.transform[4] - b.transform[4]);
      let linha = '';
      let fimAnterior = null;
      for (const it of itens) {
        const x = it.transform[4];
        if (fimAnterior === null) {
          linha += ' '.repeat(Math.max(Math.round(x / larguraChar), 0));
        } else {
          const gap = x - fimAnterior;
          linha += ' '.repeat(gap > 1 ? Math.max(Math.round(gap / larguraChar), 1) : 0);
        }
        linha += it.str;
        fimAnterior = x + (it.width != null ? it.width : it.str.length * larguraChar);
      }
      return linha;
    });

    paginas.push(textoPagina.join('\n'));
    if (onProgress) onProgress(p, pdf.numPages);
  }

  return paginas.join('\n\f\n');
}

// Extração "sequencial" — sem reconstrução de layout por posição, só junta os
// itens de texto na ordem em que o PDF os emite. Alguns geradores de PDF (ex:
// o relatório de Horas Extras/ponto, feito por outra ferramenta que não o
// Senior) já emitem o texto na ordem de leitura correta; tentar reconstruir
// layout por coordenada X/Y nesses casos EMBARALHA o texto. Use esta função
// para esses relatórios; extrairTextoLayout() continua sendo a certa para a
// Relação de Cálculo (Senior/Rubi) e o Relatório de Chefia.
export async function extrairTextoSequencial(arrayBuffer, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const paginas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    paginas.push(content.items.map((it) => it.str).join(' '));
    if (onProgress) onProgress(p, pdf.numPages);
  }
  return paginas.join('\n');
}

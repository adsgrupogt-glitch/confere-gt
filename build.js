// build.js — roda com "npm run build". Não precisa mexer neste arquivo.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['index.jsx'],
  bundle: true,
  outfile: 'bundle.js',
  minify: !watch,
  sourcemap: watch,
  loader: { '.js': 'jsx' },
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
};

// Copia o worker do pdf.js pra raiz do projeto (arquivo estático, servido
// junto do index.html pelo GitHub Pages). Isso evita carregar o worker de
// um CDN externo em tempo de execução — além de mais rápido e mais
// confiável, algumas soluções de antivírus marcam como suspeito qualquer
// código que monte uma URL pra baixar e executar script de fora.
function copiarWorkerPdf() {
  const origem = path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
  const destino = path.join(__dirname, 'pdf.worker.min.mjs');
  fs.copyFileSync(origem, destino);
  console.log('Worker do pdf.js copiado para pdf.worker.min.mjs');
}

async function run() {
  copiarWorkerPdf();
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('Observando mudanças... (Ctrl+C para parar)');
  } else {
    await esbuild.build(options);
    console.log('Build concluído: bundle.js gerado.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

// build.js — roda com "npm run build". Não precisa mexer neste arquivo.
const esbuild = require('esbuild');

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

async function run() {
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

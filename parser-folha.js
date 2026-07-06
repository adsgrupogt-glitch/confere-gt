// parser-folha.js
// Porta em JavaScript do parse_folha.py — mesma lógica, testada linha a
// linha contra a saída em Python antes de entrar no app.

function parseValor(s) {
  s = (s || '').trim();
  if (!s) return null;
  const neg = s.endsWith('-');
  s = s.replace(/-$/, '').trim();
  const num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(num)) return null;
  return neg ? -num : num;
}

const RUBRIC_RE = /^\s*(\d{1,5})\s+(\d{2})\s+(.+?)\s{2,}([\d.,\-]*)\s+([\d.,\-]+)\s*$/;

function parseRubricHalf(s) {
  s = s.replace(/\s+$/, '');
  if (!s.trim()) return null;
  const m = RUBRIC_RE.exec(s);
  if (!m) return null;
  const [, cod, tp, desc, ref, val] = m;
  return {
    cod: cod.trim(),
    tp,
    desc: desc.trim(),
    referencia: ref.trim() ? parseValor(ref) : null,
    valor: parseValor(val),
  };
}

const CELL_START_RE = /(?<!\S)\d{1,5}\s+0[1-9]\s+[A-ZÀ-ÜÇ0-9]/g;

function splitRow(line) {
  const matches = [...line.matchAll(CELL_START_RE)];
  if (matches.length >= 2) {
    const cut = matches[1].index;
    return [line.slice(0, cut), line.slice(cut)];
  }
  return [line, ''];
}

export function parseFolha(texto) {
  const employees = [];
  let cur = null;
  let curCC = null;

  const lines = texto.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s+/, '');
    const mCC = /^C\.Custo:\s+(.*\S)\s*$/.exec(line);
    if (mCC) { curCC = mCC[1].trim(); continue; }

    const mEmp = /^Colaborador:\s*\d+\s*-\s*(\d+)\s*-\s*(.+?)\s{2,}Adm\s*iss[ãa]o:\s*(\S*)\s+Dep\.\s*IR:\s*(\d+)\s+Dep\.\s*SF:\s*(\d+)\s+St:\s*(\S+)/.exec(line);
    if (mEmp) {
      if (cur) employees.push(cur);
      const [, matricula, nome, admissao, depIr, depSf, status] = mEmp;
      cur = {
        matricula, nome: nome.trim(), admissao,
        dep_ir: parseInt(depIr, 10), dep_sf: parseInt(depSf, 10), status,
        cargo: null, salario_base: null, centro_custo: curCC,
        rubricas: [], totais: {}, multi_cc: false,
      };
      continue;
    }

    if (cur !== null) {
      const mCargo = /Cargo:\s*(.+?)\s{2,}Sal[áa]rio Base:\s*([\d.,\-]+)/.exec(line);
      if (mCargo) {
        cur.cargo = mCargo[1].trim();
        cur.salario_base = parseValor(mCargo[2]);
        continue;
      }

      if (/^\d{9}\s*-\s*(.+\S)\s*$/.test(line)) continue;

      if (line.trim() === 'Resumo do Colaborador') {
        cur.rubricas = [];
        cur.multi_cc = true;
        continue;
      }

      if (line.startsWith('Cod. Tp')) continue;

      if (line.startsWith('Totais:')) {
        const mt = /Proventos:\s*([\d.,\-]+)\s+Vantagens:\s*([\d.,\-]+)\s+Descontos:\s*([\d.,\-]+)\s+L[íi]quido:\s*([\d.,\-]+)/.exec(line);
        if (mt) {
          cur.totais.proventos = parseValor(mt[1]);
          cur.totais.vantagens = parseValor(mt[2]);
          cur.totais.descontos = parseValor(mt[3]);
          cur.totais.liquido = parseValor(mt[4]);
        }
        continue;
      }

      if (line.includes('Bases IRRF Proc')) {
        const mb = /Bases IRRF Proc:\s*([\d.,\-]+)\s+FGTS Proc:\s*([\d.,\-]+)\s+INSS Proc:\s*([\d.,\-]+)\s+IPE Proc:\s*([\d.,\-]+)/.exec(line);
        if (mb) {
          cur.totais.irrf_base = parseValor(mb[1]);
          cur.totais.fgts_base = parseValor(mb[2]);
          cur.totais.inss_base = parseValor(mb[3]);
          cur.totais.ipe_base = parseValor(mb[4]);
        }
        continue;
      }

      const [left, right] = splitRow(line);
      const r1 = parseRubricHalf(left);
      const r2 = parseRubricHalf(right);
      if (r1) cur.rubricas.push(r1);
      if (r2) cur.rubricas.push(r2);
    }
  }

  if (cur) employees.push(cur);
  return employees;
}

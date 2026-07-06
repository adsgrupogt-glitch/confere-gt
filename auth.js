// auth.js
// Autenticação própria do Confere GT: usuário + senha numérica de 6 dígitos,
// com troca obrigatória no primeiro acesso. Mesmo modelo do Proposta GT / Cred GT.
// Os dados ficam em /usuarios/{login} no Realtime Database.

import { ref, get, set, update } from 'firebase/database';
import { db } from './firebase-config';

const SEED_ADMINS = {
  gabriel: { nome: 'Gabriel', papel: 'CEO', senha: '123456', primeiroAcesso: true, ativo: true },
  juliana: { nome: 'Juliana', papel: 'Administrativo', senha: '123456', primeiroAcesso: true, ativo: true },
  shay: { nome: 'Shay', papel: 'Operações', senha: '123456', primeiroAcesso: true, ativo: true },
};

// Roda uma vez (ou sempre que subir um usuário novo por código) — só cria quem
// ainda não existir, nunca sobrescreve senha de quem já acessou.
export async function garantirUsuariosSeed() {
  const usuariosRef = ref(db, 'usuarios');
  const snap = await get(usuariosRef);
  const existentes = snap.exists() ? snap.val() : {};
  const faltando = {};
  for (const [login, dados] of Object.entries(SEED_ADMINS)) {
    if (!existentes[login]) faltando[login] = dados;
  }
  if (Object.keys(faltando).length > 0) {
    await update(usuariosRef, faltando);
  }
}

export async function login(usuarioInput, senhaInput) {
  const login = usuarioInput.trim().toLowerCase();
  const snap = await get(ref(db, `usuarios/${login}`));
  if (!snap.exists()) return { ok: false, erro: 'Usuário ou senha incorretos.' };
  const u = snap.val();
  if (!u.ativo) return { ok: false, erro: 'Usuário desativado. Fale com um administrador.' };
  if (u.senha !== senhaInput) return { ok: false, erro: 'Usuário ou senha incorretos.' };
  if (u.primeiroAcesso) return { ok: true, precisaTrocarSenha: true, login };
  return { ok: true, precisaTrocarSenha: false, usuario: { login, ...u } };
}

export async function trocarSenha(login, novaSenha) {
  if (!/^\d{6}$/.test(novaSenha)) return { ok: false, erro: 'A senha precisa ter exatamente 6 números.' };
  if (novaSenha === '123456') return { ok: false, erro: 'Escolha uma senha diferente da padrão.' };
  await update(ref(db, `usuarios/${login}`), { senha: novaSenha, primeiroAcesso: false });
  const snap = await get(ref(db, `usuarios/${login}`));
  return { ok: true, usuario: { login, ...snap.val() } };
}

export async function listarUsuarios() {
  const snap = await get(ref(db, 'usuarios'));
  if (!snap.exists()) return [];
  return Object.entries(snap.val()).map(([login, dados]) => ({ login, ...dados }));
}

export async function criarUsuario(login, nome, papel) {
  await set(ref(db, `usuarios/${login.toLowerCase()}`), {
    nome, papel, senha: '123456', primeiroAcesso: true, ativo: true,
  });
}

export async function desativarUsuario(login) {
  await update(ref(db, `usuarios/${login}`), { ativo: false });
}

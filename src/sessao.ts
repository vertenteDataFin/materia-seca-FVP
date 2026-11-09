import { useEffect, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { obterFirebase } from './firebase';

/** Usuário logado: undefined enquanto o Firebase ainda não respondeu; null se deslogado. */
export function useUsuario(): User | null | undefined {
  const [u, setU] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(obterFirebase().auth, setU), []);
  return u;
}

export function entrarComEmail(email: string, senha: string) {
  return signInWithEmailAndPassword(obterFirebase().auth, email.trim(), senha);
}

export function redefinirSenha(email: string) {
  return sendPasswordResetEmail(obterFirebase().auth, email.trim());
}

export function sair() {
  return signOut(obterFirebase().auth);
}

const MENSAGENS: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não há conta com este e-mail. Peça ao administrador para incluir você.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. O primeiro login precisa de internet.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication → Domínios autorizados).',
  'auth/operation-not-allowed': 'Este método de login não está ativado no Firebase (Authentication → Método de login).',
};

export function mensagemErroAuth(e: unknown): string {
  const codigo = (e as { code?: string }).code ?? '';
  return MENSAGENS[codigo] ?? `Falha no login${codigo ? ` (${codigo})` : ''}.`;
}

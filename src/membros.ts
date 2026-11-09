import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { obterFirebase } from './firebase';
import { ADMINS, FAZENDA_ID } from './firebaseConfig';

export interface Membro {
  /** E-mail em minúsculas (id do documento). */
  email: string;
  nome: string;
  papel: 'admin' | 'membro';
  adicionadoPor?: string;
  em?: string;
}

function ref() {
  return collection(obterFirebase().firestore, 'fazendas', FAZENDA_ID, 'membros');
}

export function normalizarEmail(e: string) {
  return e.trim().toLowerCase();
}

/** Lista ao vivo das pessoas com acesso (undefined enquanto carrega; null se sem permissão). */
export function useMembros(): Membro[] | null | undefined {
  const [m, setM] = useState<Membro[] | null | undefined>(undefined);
  useEffect(
    () =>
      onSnapshot(
        ref(),
        (snap) => setM(snap.docs.map((d) => ({ ...(d.data() as Omit<Membro, 'email'>), email: d.id })).sort((a, b) => a.email.localeCompare(b.email))),
        () => setM(null),
      ),
    [],
  );
  return m;
}

export function ehAdmin(email: string | null | undefined, membros: Membro[] | null | undefined): boolean {
  if (!email) return false;
  const e = normalizarEmail(email);
  return ADMINS.map(normalizarEmail).includes(e) || !!membros?.some((m) => m.email === e && m.papel === 'admin');
}

export function adicionarMembro(email: string, nome: string, papel: Membro['papel'], porQuem: string) {
  const e = normalizarEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail inválido.');
  return setDoc(doc(ref(), e), { nome: nome.trim(), papel, adicionadoPor: porQuem, em: new Date().toISOString() });
}

export function removerMembro(email: string) {
  return deleteDoc(doc(ref(), normalizarEmail(email)));
}

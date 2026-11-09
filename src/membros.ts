import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { obterFirebase } from './firebase';
import { ADMINS, FAZENDA_ID } from './firebaseConfig';

/**
 * admin: tudo, inclui pessoas · membro: tudo nos dados, não gerencia pessoas ·
 * operador: consulta e registra (coletas, pontos, pesos), não exclui nem mexe em talhões.
 */
export type Papel = 'admin' | 'membro' | 'operador';

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador (tudo, inclui pessoas)',
  membro: 'Membro (registra e exclui)',
  operador: 'Operador (consulta e registra, não exclui)',
};

export interface Membro {
  /** E-mail em minúsculas (id do documento). */
  email: string;
  nome: string;
  papel: Papel;
  adicionadoPor?: string;
  em?: string;
}

function ref() {
  return collection(obterFirebase().firestore, 'fazendas', FAZENDA_ID, 'membros');
}

export function normalizarEmail(e: string) {
  return e.trim().toLowerCase();
}

/**
 * Lista ao vivo das pessoas com acesso (undefined enquanto carrega; null se sem permissão).
 * Sem permissão (conta ainda não liberada), tenta de novo a cada 15 s para perceber a liberação.
 */
export function useMembros(): Membro[] | null | undefined {
  const [m, setM] = useState<Membro[] | null | undefined>(undefined);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelar = onSnapshot(
      ref(),
      (snap) => setM(snap.docs.map((d) => ({ ...(d.data() as Omit<Membro, 'email'>), email: d.id })).sort((a, b) => a.email.localeCompare(b.email))),
      () => {
        setM(null);
        timer = setTimeout(() => setTentativa((n) => n + 1), 15000);
      },
    );
    return () => {
      cancelar();
      if (timer) clearTimeout(timer);
    };
  }, [tentativa]);
  return m;
}

/** Papel de um e-mail: admins fixos sempre são admin; quem não está na lista é tratado como operador (as regras bloqueiam de qualquer jeito). */
export function papelDe(email: string | null | undefined, membros: Membro[] | null | undefined): Papel {
  if (!email) return 'operador';
  const e = normalizarEmail(email);
  if (ADMINS.map(normalizarEmail).includes(e)) return 'admin';
  return membros?.find((m) => m.email === e)?.papel ?? 'operador';
}

export function ehAdmin(email: string | null | undefined, membros: Membro[] | null | undefined): boolean {
  return papelDe(email, membros) === 'admin';
}

export function adicionarMembro(email: string, nome: string, papel: Papel, porQuem: string) {
  const e = normalizarEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail inválido.');
  return setDoc(doc(ref(), e), { nome: nome.trim(), papel, adicionadoPor: porQuem, em: new Date().toISOString() });
}

export function removerMembro(email: string) {
  return deleteDoc(doc(ref(), normalizarEmail(email)));
}

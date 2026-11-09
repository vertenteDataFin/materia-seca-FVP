import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { obterFirebase } from './firebase';
import { FAZENDA_ID } from './firebaseConfig';
import { adicionarMembro, normalizarEmail, type Papel } from './membros';

/** Pedido de acesso de quem criou a conta e ainda não foi liberado por um administrador. */
export interface Solicitacao {
  email: string;
  nome: string;
  em: string;
}

function ref() {
  return collection(obterFirebase().firestore, 'fazendas', FAZENDA_ID, 'solicitacoes');
}

/** Registra (ou atualiza) o pedido de acesso da própria conta. */
export function registrarSolicitacao(email: string, nome: string) {
  const e = normalizarEmail(email);
  return setDoc(doc(ref(), e), { email: e, nome: nome.trim(), em: new Date().toISOString() });
}

/** Lista ao vivo dos pedidos (só administradores conseguem ler; null se sem permissão). */
export function useSolicitacoes(ativo: boolean): Solicitacao[] | null | undefined {
  const [s, setS] = useState<Solicitacao[] | null | undefined>(undefined);
  useEffect(() => {
    if (!ativo) return;
    return onSnapshot(
      ref(),
      (snap) => setS(snap.docs.map((d) => d.data() as Solicitacao).sort((a, b) => a.em.localeCompare(b.em))),
      () => setS(null),
    );
  }, [ativo]);
  return ativo ? s : [];
}

/** Libera o pedido: inclui como membro com o papel escolhido e apaga a solicitação. */
export async function liberarSolicitacao(s: Solicitacao, papel: Papel, porQuem: string) {
  await adicionarMembro(s.email, s.nome, papel, porQuem);
  await deleteDoc(doc(ref(), s.email));
}

export function recusarSolicitacao(email: string) {
  return deleteDoc(doc(ref(), normalizarEmail(email)));
}

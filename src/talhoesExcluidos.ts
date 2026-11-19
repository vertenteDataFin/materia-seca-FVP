import { arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';
import { FAZENDA_ID } from './firebaseConfig';
import { chaveNome, siglaFazenda } from './kml';

/**
 * Talhões do mapa (KML) que alguém excluiu no app. A sincronização com o KML não os cria de novo
 * (antes, cada aparelho que sincronizava trazia o talhão de volta). Fica em fazendas/<id>/config/talhoesExcluidos.
 */

const CHAVE_LOCAL = 'silagem-ms:talhoes-excluidos';

/** Identifica o talhão pelo local + número (ex.: "CAU|1"), igual para o nome do app e o do KML. */
export function chaveTalhao(nome: string, fazenda?: string): string {
  return `${siglaFazenda(fazenda ?? '', nome).toUpperCase()}|${chaveNome(nome)}`;
}

const ref = () => doc(obterFirebase().firestore, 'fazendas', FAZENDA_ID, 'config', 'talhoesExcluidos');

function lerLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Lista atual (da nuvem; sem Firebase, do aparelho). Em caso de falha, devolve o que o aparelho já sabe. */
export async function lerTalhoesExcluidos(): Promise<Set<string>> {
  const locais = lerLocal();
  if (!FIREBASE_ATIVO) return new Set(locais);
  try {
    const snap = await getDoc(ref());
    const nuvem = (snap.data()?.chaves as string[] | undefined) ?? [];
    const todas = [...new Set([...nuvem, ...locais])];
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(todas));
    return new Set(todas);
  } catch (e) {
    console.warn('Lista de talhões excluídos indisponível', e);
    return new Set(locais);
  }
}

/** Registra que o talhão foi excluído de propósito (só os que vieram do mapa importam). */
export function marcarTalhaoExcluido(nome: string, fazenda?: string) {
  const chave = chaveTalhao(nome, fazenda);
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify([...new Set([...lerLocal(), chave])]));
  } catch {
    /* sem armazenamento no aparelho */
  }
  if (FIREBASE_ATIVO) {
    setDoc(ref(), { chaves: arrayUnion(chave) }, { merge: true }).catch((e) => console.error('Falha ao registrar talhão excluído', e));
  }
}

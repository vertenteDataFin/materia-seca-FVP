import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';
import { PARAMETROS_PADRAO, type Parametros } from './calc';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';
import { FAZENDA_ID } from './firebaseConfig';
import { registrarHistorico } from './historico';
import { lerParametros, salvarParametros as salvarLocal } from './util';

/**
 * Parâmetros da estimativa compartilhados: ficam em fazendas/<id>/config/parametros (só administradores gravam)
 * e são espelhados no localStorage para leitura síncrona e uso sem conexão. Quem muda, muda para todos.
 */
const CAMPOS: (keyof Parametros)[] = ['perdasPct', 'densidadeKgM3', 'msMin', 'msMax'];
const ROTULO: Record<keyof Parametros, string> = { perdasPct: 'perdas (%)', densidadeKgM3: 'densidade (kg/m³)', msMin: 'MS mínima (%)', msMax: 'MS máxima (%)' };

let atual: Parametros = lerParametros();
const assinantes = new Set<() => void>();

function emitir(p: Parametros) {
  atual = p;
  salvarLocal(p);
  for (const cb of assinantes) cb();
}

function assinar(cb: () => void) {
  assinantes.add(cb);
  return () => void assinantes.delete(cb);
}

/** Parâmetros atuais, re-renderizando quando mudarem (neste aparelho ou em outro). */
export function useParametros(): Parametros {
  return useSyncExternalStore(assinar, () => atual, () => atual);
}

export function parametrosAtuais(): Parametros {
  return atual;
}

function ref(fs: Firestore, fazendaId: string) {
  return doc(fs, 'fazendas', fazendaId, 'config', 'parametros');
}

function limpar(dados: Record<string, unknown> | undefined): Parametros {
  const p = { ...PARAMETROS_PADRAO };
  for (const k of CAMPOS) {
    const v = dados?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) p[k] = v;
  }
  return p;
}

/** Ouve os parâmetros da nuvem; devolve a função para parar. */
export function assinarParametrosNuvem(fs: Firestore, fazendaId: string): () => void {
  return onSnapshot(
    ref(fs, fazendaId),
    (snap) => {
      if (snap.exists()) emitir(limpar(snap.data()));
    },
    (e) => console.warn('Parâmetros da nuvem indisponíveis', e),
  );
}

/**
 * Salva os parâmetros: na nuvem (vale para todos) quando o Firebase está ativo, senão só neste aparelho.
 * Registra a mudança no histórico.
 */
export async function salvarParametrosNuvem(p: Parametros, quem = ''): Promise<void> {
  const antes = atual;
  emitir({ ...p });
  if (!FIREBASE_ATIVO) return;
  const { firestore } = obterFirebase();
  await setDoc(ref(firestore, FAZENDA_ID), { ...p, atualizadoEm: new Date().toISOString(), atualizadoPor: quem });
  const mudancas = CAMPOS.filter((k) => antes[k] !== p[k]).map((k) => `${ROTULO[k]}: ${antes[k]} → ${p[k]}`);
  if (mudancas.length) void registrarHistorico(firestore, FAZENDA_ID, quem, { acao: 'editou', descricao: `parâmetros da estimativa — ${mudancas.join(' · ')}` });
}

/** Testes: zera o estado em memória. */
export function _reiniciarParametros(p: Parametros = PARAMETROS_PADRAO) {
  atual = p;
}

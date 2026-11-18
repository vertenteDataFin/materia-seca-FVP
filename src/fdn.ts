import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';
import { FAZENDA_ID } from './firebaseConfig';
import { registrarHistorico } from './historico';
import { pennState } from './amostragemColheita';
import type { AmostraColheita } from './tipos';

/**
 * FDN efetiva (peFDN) das amostras de caminhão: peFDN = FDN (% da MS) × fator de efetividade física (pef).
 * O pef vem do Penn State: fração retida acima de 8 mm (19 + 8 mm) ou acima de 4 mm (19 + 8 + 4 mm, tudo menos o fundo).
 * A FDN vem da análise de laboratório da amostra, quando houver; senão, da FDN de referência do capim (Configurações).
 */
export type FaixaPef = '4' | '8' | 'ambos';

export interface ConfigFdn {
  /** Qual fator mostrar: pef > 4 mm, pef > 8 mm ou os dois. */
  pef: FaixaPef;
  /** FDN de referência por capim (% da MS), pela chave normalizada do capim. */
  fdnPorCapim: Record<string, number>;
}

export const CONFIG_FDN_PADRAO: ConfigFdn = { pef: '4', fdnPorCapim: {} };

/** Chave do capim para a tabela de FDN: sem acento, minúsculas ("Mombaça" → "mombaca"). */
export function chaveCapim(capim: string): string {
  return capim.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Fatores de efetividade física do Penn State (0–1); null sem os 4 pesos. */
export function fatoresPef(a: Pick<AmostraColheita, 'peneira19G' | 'peneira8G' | 'peneira4G' | 'fundoG'>): { pef8: number; pef4: number } | null {
  const ps = pennState(a);
  if (!ps) return null;
  const [p19, p8, p4] = ps.pct;
  return { pef8: (p19 + p8) / 100, pef4: (p19 + p8 + p4) / 100 };
}

export interface PeFdn {
  /** FDN usada (% da MS) e de onde veio. */
  fdnPct: number | null;
  fonte: 'laboratorio' | 'capim' | null;
  pef8: number | null;
  pef4: number | null;
  /** peFDN (% da MS). */
  peFdn8: number | null;
  peFdn4: number | null;
}

/** peFDN da amostra: FDN do laboratório (prioridade) ou de referência do capim × pef do Penn State. */
export function peFdnDaAmostra(
  a: Pick<AmostraColheita, 'peneira19G' | 'peneira8G' | 'peneira4G' | 'fundoG' | 'fdnPct'>,
  capim: string,
  cfg: ConfigFdn,
): PeFdn {
  const lab = a.fdnPct ?? null;
  const ref = capim ? cfg.fdnPorCapim[chaveCapim(capim)] ?? null : null;
  const fdnPct = lab ?? ref;
  const fonte = lab != null ? 'laboratorio' : ref != null ? 'capim' : null;
  const f = fatoresPef(a);
  return {
    fdnPct,
    fonte,
    pef8: f?.pef8 ?? null,
    pef4: f?.pef4 ?? null,
    peFdn8: f && fdnPct != null ? fdnPct * f.pef8 : null,
    peFdn4: f && fdnPct != null ? fdnPct * f.pef4 : null,
  };
}

/** Título da coluna conforme o fator escolhido. */
export function rotuloPeFdn(pef: FaixaPef): string {
  return pef === '8' ? 'peFDN > 8 mm' : pef === '4' ? 'peFDN > 4 mm' : 'peFDN > 8 / > 4 mm';
}

/** Valor(es) de peFDN (% da MS) conforme o fator escolhido; null se não dá para calcular. */
export function textoPeFdn(r: PeFdn, pef: FaixaPef): string | null {
  const f = (v: number | null) => (v == null ? '—' : v.toFixed(1).replace('.', ','));
  if (pef === '8') return r.peFdn8 == null ? null : f(r.peFdn8);
  if (pef === '4') return r.peFdn4 == null ? null : f(r.peFdn4);
  return r.peFdn8 == null && r.peFdn4 == null ? null : `${f(r.peFdn8)} / ${f(r.peFdn4)}`;
}

/** Por que a peFDN não saiu: falta Penn State ou falta FDN. */
export function faltaPeFdn(r: PeFdn): string {
  if (r.pef4 == null) return 'falta o Penn State';
  if (r.fdnPct == null) return 'falta a FDN';
  return '';
}

// ---- Configuração compartilhada (fazendas/<id>/config/fdn), espelhada no aparelho ----

const CHAVE_LOCAL = 'silagem-ms:config-fdn';

function lerLocal(): ConfigFdn {
  try {
    return limpar(JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? 'null'));
  } catch {
    return CONFIG_FDN_PADRAO;
  }
}

function limpar(d: unknown): ConfigFdn {
  const o = (d ?? {}) as Partial<ConfigFdn>;
  const pef: FaixaPef = o.pef === '8' || o.pef === 'ambos' ? o.pef : '4';
  const fdnPorCapim: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.fdnPorCapim ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100) fdnPorCapim[chaveCapim(k)] = v;
  }
  return { pef, fdnPorCapim };
}

let atual: ConfigFdn = typeof localStorage === 'undefined' ? CONFIG_FDN_PADRAO : lerLocal();
const assinantes = new Set<() => void>();

function emitir(c: ConfigFdn) {
  atual = c;
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(c));
  } catch {
    /* sem armazenamento: só não guarda no aparelho */
  }
  for (const cb of assinantes) cb();
}

export function useConfigFdn(): ConfigFdn {
  return useSyncExternalStore(
    (cb) => {
      assinantes.add(cb);
      return () => void assinantes.delete(cb);
    },
    () => atual,
    () => atual,
  );
}

export function configFdnAtual(): ConfigFdn {
  return atual;
}

const ref = (fs: Firestore, fazendaId: string) => doc(fs, 'fazendas', fazendaId, 'config', 'fdn');

/** Ouve a configuração da nuvem; devolve a função para parar. */
export function assinarConfigFdnNuvem(fs: Firestore, fazendaId: string): () => void {
  return onSnapshot(
    ref(fs, fazendaId),
    (snap) => {
      if (snap.exists()) emitir(limpar(snap.data()));
    },
    (e) => console.warn('Configuração de FDN indisponível', e),
  );
}

const ROTULO_PEF: Record<FaixaPef, string> = { '4': 'pef > 4 mm', '8': 'pef > 8 mm', ambos: 'pef > 8 mm e > 4 mm' };

/** Salva para todos (administradores) e registra no histórico. */
export async function salvarConfigFdn(c: ConfigFdn, quem = ''): Promise<void> {
  const antes = atual;
  const nova = limpar(c);
  emitir(nova);
  if (!FIREBASE_ATIVO) return;
  const { firestore } = obterFirebase();
  await setDoc(ref(firestore, FAZENDA_ID), { ...nova, atualizadoEm: new Date().toISOString(), atualizadoPor: quem });
  const mudancas: string[] = [];
  if (antes.pef !== nova.pef) mudancas.push(`fator: ${ROTULO_PEF[antes.pef]} → ${ROTULO_PEF[nova.pef]}`);
  const capins = new Set([...Object.keys(antes.fdnPorCapim), ...Object.keys(nova.fdnPorCapim)]);
  for (const k of capins) {
    if (antes.fdnPorCapim[k] !== nova.fdnPorCapim[k]) mudancas.push(`FDN ${k}: ${antes.fdnPorCapim[k] ?? '—'} → ${nova.fdnPorCapim[k] ?? '—'}`);
  }
  if (mudancas.length) void registrarHistorico(firestore, FAZENDA_ID, quem, { acao: 'editou', descricao: `FDN efetiva — ${mudancas.join(' · ')}` });
}

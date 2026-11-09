import { useMemo, useSyncExternalStore } from 'react';
import type { Repositorio } from './repositorio';
import { compararNomes, type Amostra, type Coleta, type Dados, type Novo, type Talhao } from './tipos';

let atual: Repositorio | null = null;

/** Define a fonte de dados em uso (nuvem após login, local sem Firebase, memória nos testes). */
export function definirRepositorio(r: Repositorio | null) {
  atual = r;
}

export function repositorio(): Repositorio {
  if (!atual) throw new Error('Fonte de dados ainda não definida.');
  return atual;
}

export function dadosAtuais(): Dados {
  return repositorio().obter() ?? { talhoes: [], coletas: [], amostras: [] };
}

const ligacoes = new WeakMap<Repositorio, { assinar: (cb: () => void) => () => void; obter: () => Dados | undefined }>();
function ligar(r: Repositorio) {
  let l = ligacoes.get(r);
  if (!l) {
    l = { assinar: (cb) => r.assinar(cb), obter: () => r.obter() };
    ligacoes.set(r, l);
  }
  return l;
}

/**
 * Dados ao vivo: talhões em ordem natural de nome e amostras por coleta/ponto.
 * undefined enquanto a primeira carga não chegou.
 */
export function useDados(): Dados | undefined {
  const l = ligar(repositorio());
  const bruto = useSyncExternalStore(l.assinar, l.obter, l.obter);
  return useMemo(() => {
    if (!bruto) return undefined;
    return {
      talhoes: [...bruto.talhoes].sort((a, b) => compararNomes(a.nome, b.nome)),
      coletas: bruto.coletas,
      amostras: [...bruto.amostras].sort((a, b) => a.coletaId.localeCompare(b.coletaId) || a.ponto - b.ponto),
    };
  }, [bruto]);
}

/** Agrupa amostras por coleta (ordenadas por ponto). */
export function amostrasPorColeta(amostras: Amostra[]): Map<string, Amostra[]> {
  const m = new Map<string, Amostra[]>();
  for (const a of amostras) m.set(a.coletaId, [...(m.get(a.coletaId) ?? []), a]);
  for (const l of m.values()) l.sort((a, b) => a.ponto - b.ponto);
  return m;
}

/** Coleta mais recente de cada talhão. */
export function ultimaColetaPorTalhao(coletas: Coleta[]): Map<string, Coleta> {
  const m = new Map<string, Coleta>();
  for (const c of coletas) {
    const a = m.get(c.talhaoId);
    if (!a || c.data > a.data || (c.data === a.data && (c.criadoEm ?? '') > (a.criadoEm ?? ''))) m.set(c.talhaoId, c);
  }
  return m;
}

// ---- Talhões ----

export function adicionarTalhao(t: Novo<Talhao>): string {
  return repositorio().adicionar('talhoes', t);
}

export function atualizarTalhao(id: string, campos: Partial<Novo<Talhao>>) {
  repositorio().atualizar('talhoes', id, campos);
}

/** Exclui um talhão e todas as suas coletas e amostras. */
export function excluirTalhao(id: string) {
  const d = dadosAtuais();
  const coletas = d.coletas.filter((c) => c.talhaoId === id);
  const ids = new Set(coletas.map((c) => c.id));
  repositorio().lote([
    ...d.amostras.filter((a) => ids.has(a.coletaId)).map((a) => ({ tipo: 'remover' as const, colecao: 'amostras' as const, id: a.id })),
    ...coletas.map((c) => ({ tipo: 'remover' as const, colecao: 'coletas' as const, id: c.id })),
    { tipo: 'remover', colecao: 'talhoes', id },
  ]);
}

// ---- Coletas ----

export function atualizarColeta(id: string, campos: Partial<Novo<Coleta>>) {
  repositorio().atualizar('coletas', id, campos);
}

/** Exclui uma coleta e suas amostras. */
export function excluirColeta(id: string) {
  const d = dadosAtuais();
  repositorio().lote([
    ...d.amostras.filter((a) => a.coletaId === id).map((a) => ({ tipo: 'remover' as const, colecao: 'amostras' as const, id: a.id })),
    { tipo: 'remover', colecao: 'coletas', id },
  ]);
}

// ---- Amostras ----

export function adicionarAmostra(a: Novo<Amostra>): string {
  return repositorio().adicionar('amostras', a);
}

export function atualizarAmostra(id: string, campos: Partial<Novo<Amostra>>) {
  repositorio().atualizar('amostras', id, campos);
}

export function excluirAmostra(id: string) {
  repositorio().remover('amostras', id);
}

// ---- Backup ----

export interface Backup {
  app: 'silagem-ms';
  versao: number;
  exportadoEm: string;
  parametros?: unknown;
  talhoes: unknown[];
  coletas: unknown[];
  amostras: unknown[];
}

/**
 * Substitui todos os dados pelos do backup. Aceita a versão 1 (ids numéricos do app antigo):
 * os ids são convertidos para texto mantendo os vínculos.
 */
export function restaurarBackup(b: Backup) {
  const d = dadosAtuais();
  const idT = new Map<string, string>();
  const idC = new Map<string, string>();
  const r = repositorio();
  const talhoes = (b.talhoes as (Talhao & { id: string | number })[]).map((t) => {
    const id = r.novoId();
    idT.set(String(t.id), id);
    return { ...t, id };
  });
  const coletas = (b.coletas as (Coleta & { id: string | number; talhaoId: string | number })[]).map((c) => {
    const id = r.novoId();
    idC.set(String(c.id), id);
    return { ...c, id, talhaoId: idT.get(String(c.talhaoId)) ?? String(c.talhaoId) };
  });
  const amostras = (b.amostras as (Amostra & { id: string | number; coletaId: string | number })[]).map((a) => ({
    ...a,
    id: r.novoId(),
    coletaId: idC.get(String(a.coletaId)) ?? String(a.coletaId),
  }));
  r.lote([
    ...d.amostras.map((a) => ({ tipo: 'remover' as const, colecao: 'amostras' as const, id: a.id })),
    ...d.coletas.map((c) => ({ tipo: 'remover' as const, colecao: 'coletas' as const, id: c.id })),
    ...d.talhoes.map((t) => ({ tipo: 'remover' as const, colecao: 'talhoes' as const, id: t.id })),
    ...talhoes.map(({ id, ...t }) => ({ tipo: 'adicionar' as const, colecao: 'talhoes' as const, id, dados: t as Record<string, unknown> })),
    ...coletas.map(({ id, ...c }) => ({ tipo: 'adicionar' as const, colecao: 'coletas' as const, id, dados: c as Record<string, unknown> })),
    ...amostras.map(({ id, ...a }) => ({ tipo: 'adicionar' as const, colecao: 'amostras' as const, id, dados: a as Record<string, unknown> })),
  ]);
}

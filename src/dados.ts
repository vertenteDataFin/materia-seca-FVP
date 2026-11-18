import { useMemo, useSyncExternalStore } from 'react';
import type { Repositorio } from './repositorio';
import { nomeSilo } from './silos';
import { compararNomes, completarDados, type Amostra, type AmostraColheita, type Carga, type Coleta, type Dados, type Novo, type Talhao, type Veiculo } from './tipos';

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
  return completarDados(repositorio().obter());
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
      // mais recente primeiro
      // silo com nome padronizado ("Trincheira 01" da balança → "Trincheira 1")
      cargas: (bruto.cargas ?? [])
        .map((c) => (c.silo && c.silo !== nomeSilo(c.silo) ? { ...c, silo: nomeSilo(c.silo) } : c))
        .sort((a, b) => b.saidaEm.localeCompare(a.saidaEm) || b.id.localeCompare(a.id)),
      // mais recente primeiro
      amostrasColheita: (bruto.amostrasColheita ?? [])
        .map((a) => (a.silo !== nomeSilo(a.silo) ? { ...a, silo: nomeSilo(a.silo) } : a))
        .sort((a, b) => b.coletadaEm.localeCompare(a.coletadaEm) || b.id.localeCompare(a.id)),
      // pelo nº de cadastro; sem número, no fim por motorista
      veiculos: [...(bruto.veiculos ?? [])].sort(
        (a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity) || a.motorista.localeCompare(b.motorista, 'pt-BR'),
      ),
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

/** Exclui um talhão e todas as suas coletas, amostras, cargas e amostras de colheita. */
export function excluirTalhao(id: string) {
  const d = dadosAtuais();
  const coletas = d.coletas.filter((c) => c.talhaoId === id);
  const ids = new Set(coletas.map((c) => c.id));
  repositorio().lote([
    ...d.amostras.filter((a) => ids.has(a.coletaId)).map((a) => ({ tipo: 'remover' as const, colecao: 'amostras' as const, id: a.id })),
    ...coletas.map((c) => ({ tipo: 'remover' as const, colecao: 'coletas' as const, id: c.id })),
    ...d.cargas.filter((c) => c.talhaoId === id).map((c) => ({ tipo: 'remover' as const, colecao: 'cargas' as const, id: c.id })),
    ...d.amostrasColheita.filter((a) => a.talhaoId === id).map((a) => ({ tipo: 'remover' as const, colecao: 'amostrasColheita' as const, id: a.id })),
    { tipo: 'remover', colecao: 'talhoes', id },
  ]);
}

// ---- Cargas (colheita) ----

export function adicionarCarga(c: Novo<Carga>): string {
  return repositorio().adicionar('cargas', { ...c, criadoEm: c.criadoEm ?? new Date().toISOString() });
}

/** Grava de uma vez as cargas lidas do relatório da balança (uma entrada no histórico). */
export function importarCargas(cargas: Novo<Carga>[], descricao: string) {
  if (!cargas.length) return;
  const r = repositorio();
  const criadoEm = new Date().toISOString();
  r.lote(
    cargas.map((c) => ({ tipo: 'adicionar' as const, colecao: 'cargas' as const, id: r.novoId(), dados: { ...c, criadoEm } as Record<string, unknown> })),
    { descricao },
  );
}

export function atualizarCarga(id: string, campos: Partial<Novo<Carga>>) {
  repositorio().atualizar('cargas', id, campos);
}

export function excluirCarga(id: string) {
  repositorio().remover('cargas', id);
}

// ---- Amostras de colheita (caminhões) ----

export function adicionarAmostraColheita(a: Novo<AmostraColheita>): string {
  return repositorio().adicionar('amostrasColheita', { ...a, criadoEm: a.criadoEm ?? new Date().toISOString() });
}

export function atualizarAmostraColheita(id: string, campos: Partial<Novo<AmostraColheita>>) {
  repositorio().atualizar('amostrasColheita', id, campos);
}

export function excluirAmostraColheita(id: string) {
  repositorio().remover('amostrasColheita', id);
}

// ---- Veículos (colheita) ----

export function adicionarVeiculo(v: Novo<Veiculo>): string {
  return repositorio().adicionar('veiculos', { ...v, criadoEm: v.criadoEm ?? new Date().toISOString() });
}

export function atualizarVeiculo(id: string, campos: Partial<Novo<Veiculo>>) {
  repositorio().atualizar('veiculos', id, campos);
}

export function excluirVeiculo(id: string) {
  repositorio().remover('veiculos', id);
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
  /** Cargas da colheita (backups antigos não têm). */
  cargas?: unknown[];
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
  const cargas = ((b.cargas ?? []) as (Carga & { talhaoId: string | number })[]).map((c) => ({
    ...c,
    id: r.novoId(),
    talhaoId: idT.get(String(c.talhaoId)) ?? String(c.talhaoId),
  }));
  r.lote([
    ...d.cargas.map((c) => ({ tipo: 'remover' as const, colecao: 'cargas' as const, id: c.id })),
    ...cargas.map(({ id, ...c }) => ({ tipo: 'adicionar' as const, colecao: 'cargas' as const, id, dados: c as Record<string, unknown> })),
    ...d.amostras.map((a) => ({ tipo: 'remover' as const, colecao: 'amostras' as const, id: a.id })),
    ...d.coletas.map((c) => ({ tipo: 'remover' as const, colecao: 'coletas' as const, id: c.id })),
    ...d.talhoes.map((t) => ({ tipo: 'remover' as const, colecao: 'talhoes' as const, id: t.id })),
    ...talhoes.map(({ id, ...t }) => ({ tipo: 'adicionar' as const, colecao: 'talhoes' as const, id, dados: t as Record<string, unknown> })),
    ...coletas.map(({ id, ...c }) => ({ tipo: 'adicionar' as const, colecao: 'coletas' as const, id, dados: c as Record<string, unknown> })),
    ...amostras.map(({ id, ...a }) => ({ tipo: 'adicionar' as const, colecao: 'amostras' as const, id, dados: a as Record<string, unknown> })),
  ]);
}

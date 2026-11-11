import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { Operacao } from './repositorio';
import { gerarId } from './repositorio';
import type { Amostra, Colecao, Coleta, Dados, Talhao } from './tipos';
import { fmtData } from './util';

/**
 * Histórico de alterações: uma entrada por gravação (criação, edição, exclusão, restauração), com quem fez,
 * quando e o que mudou. Exclusões e edições guardam os dados anteriores para poder desfazer.
 */
export type AcaoHistorico = 'criou' | 'editou' | 'excluiu' | 'restaurou';

export const ROTULO_ACAO: Record<AcaoHistorico, string> = { criou: 'Criou', editou: 'Editou', excluiu: 'Excluiu', restaurou: 'Restaurou' };

/** Dados anteriores guardados numa entrada, para desfazer. */
export interface ItensHistorico {
  /** Registros excluídos, completos. */
  removidos: Partial<Record<Colecao, Record<string, unknown>[]>>;
  /** Registros editados: id + só os campos alterados, com os valores de antes. */
  anteriores: Partial<Record<Colecao, Record<string, unknown>[]>>;
}

export interface EntradaHistorico {
  id: string;
  em: string;
  quem: string;
  acao: AcaoHistorico;
  descricao: string;
  /** JSON de ItensHistorico (só em exclusões e edições). */
  itensJson?: string;
  restauradoEm?: string;
  restauradoPor?: string;
}

/** Rótulo opcional de um lote: muda a ação registrada (ex.: restauração) ou a descrição. */
export interface RotuloLote {
  acao?: AcaoHistorico;
  descricao?: string;
  /** Não registra no histórico (ex.: carga inicial silenciosa). */
  silencioso?: boolean;
}

const ROTULO_CAMPO: Record<string, string> = {
  nome: 'nome', areaHa: 'área (ha)', capim: 'capim', observacoes: 'observações', fazenda: 'fazenda',
  data: 'data', responsavel: 'responsável', areaAmostralM2: 'quadro (m²)',
  ponto: 'nº do ponto', pesoVerdeKg: 'peso verde (kg)', pesoUmidoG: 'úmido (g)', pesoSecoG: 'seco (g)',
  lat: 'posição', lng: 'posição', precisaoM: 'precisão GPS', capturadoEm: 'posição',
};

function valor(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000).replace('.', ',');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtData(v);
  if (typeof v === 'string') return v.length > 30 ? `${v.slice(0, 30)}…` : v;
  return String(v);
}

const LIMITE_ITENS_JSON = 800_000; // bem abaixo de 1 MiB por documento do Firestore

/** Nomes legíveis dos registros, usando o estado anterior ao lote (os excluídos ainda existem nele). */
function nomes(d: Dados) {
  const talhao = (id: string) => d.talhoes.find((t) => t.id === id)?.nome ?? 'talhão?';
  const coleta = (c: Coleta | undefined) => (c ? `coleta ${talhao(c.talhaoId)} · ${fmtData(c.data)}` : 'coleta?');
  return {
    talhoes: (t: Talhao) => `talhão ${t.nome}`,
    coletas: (c: Coleta) => coleta(c),
    amostras: (a: Amostra) => `ponto ${a.ponto} da ${coleta(d.coletas.find((c) => c.id === a.coletaId))}`,
  };
}

const PLURAL: Record<Colecao, [string, string]> = { talhoes: ['talhão', 'talhões'], coletas: ['coleta', 'coletas'], amostras: ['amostra', 'amostras'] };

function contagem(porColecao: Partial<Record<Colecao, unknown[]>>): string {
  return (['talhoes', 'coletas', 'amostras'] as Colecao[])
    .filter((c) => porColecao[c]?.length)
    .map((c) => `${porColecao[c]!.length} ${PLURAL[c][porColecao[c]!.length === 1 ? 0 : 1]}`)
    .join(', ');
}

/**
 * Descreve um lote de operações para o histórico. `anterior` é o estado antes do lote.
 * Devolve null quando não há nada a registrar.
 */
export function descreverLote(ops: Operacao[], anterior: Dados, rotulo?: RotuloLote): Pick<EntradaHistorico, 'acao' | 'descricao' | 'itensJson'> | null {
  if (rotulo?.silencioso || !ops.length) return null;
  const n = nomes(anterior);
  const docAnterior = (colecao: Colecao, id: string) => (anterior[colecao] as { id: string }[]).find((x) => x.id === id);

  const removidos: ItensHistorico['removidos'] = {};
  const anteriores: ItensHistorico['anteriores'] = {};
  const criados: Partial<Record<Colecao, Record<string, unknown>[]>> = {};
  const mudancas: string[] = [];

  for (const op of ops) {
    if (op.tipo === 'remover') {
      const d = docAnterior(op.colecao, op.id);
      if (d) (removidos[op.colecao] ??= []).push(d as Record<string, unknown>);
    } else if (op.tipo === 'adicionar') {
      (criados[op.colecao] ??= []).push({ ...op.dados, id: op.id });
    } else {
      const d = docAnterior(op.colecao, op.id) as Record<string, unknown> | undefined;
      if (!d) continue;
      const campos = Object.keys(op.dados).filter((k) => JSON.stringify(d[k] ?? null) !== JSON.stringify(op.dados[k] ?? null));
      if (!campos.length) continue;
      (anteriores[op.colecao] ??= []).push({ id: op.id, ...Object.fromEntries(campos.map((k) => [k, d[k] ?? null])) });
      const vistos = new Set<string>();
      for (const k of campos) {
        const r = ROTULO_CAMPO[k] ?? k;
        if (vistos.has(r)) continue;
        vistos.add(r);
        mudancas.push(r === 'posição' ? 'posição' : `${r}: ${valor(d[k])} → ${valor(op.dados[k])}`);
      }
    }
  }

  const principal = (grupo: Partial<Record<Colecao, Record<string, unknown>[]>>) => {
    const total = Object.values(grupo).reduce((s, l) => s + (l?.length ?? 0), 0);
    for (const c of ['talhoes', 'coletas', 'amostras'] as Colecao[]) {
      const lista = grupo[c];
      if (!lista?.length) continue;
      if (lista.length === 1 && total <= 1) return (n[c] as (x: unknown) => string)(lista[0]);
      if (lista.length === 1 && c !== 'amostras') {
        const resto = { ...grupo, [c]: [] };
        return `${(n[c] as (x: unknown) => string)(lista[0])} (${contagem(resto)})`;
      }
      return contagem(grupo);
    }
    return '';
  };

  let acao: AcaoHistorico;
  let descricao: string;
  if (Object.keys(removidos).length) {
    acao = 'excluiu';
    descricao = principal(removidos);
  } else if (Object.keys(criados).length) {
    acao = 'criou';
    // o nome do talhão/coleta criado ainda não está no estado anterior: usa os dados da operação
    const estadoComCriados: Dados = {
      talhoes: [...anterior.talhoes, ...((criados.talhoes ?? []) as unknown as Talhao[])],
      coletas: [...anterior.coletas, ...((criados.coletas ?? []) as unknown as Coleta[])],
      amostras: anterior.amostras,
    };
    const nc = nomes(estadoComCriados);
    const total = Object.values(criados).reduce((s, l) => s + (l?.length ?? 0), 0);
    const primeiro = (['talhoes', 'coletas', 'amostras'] as Colecao[]).find((c) => criados[c]?.length)!;
    descricao = total === 1 ? (nc[primeiro] as (x: unknown) => string)(criados[primeiro]![0]) : contagem(criados);
  } else if (Object.keys(anteriores).length) {
    acao = 'editou';
    const total = Object.values(anteriores).reduce((s, l) => s + (l?.length ?? 0), 0);
    const primeiro = (['talhoes', 'coletas', 'amostras'] as Colecao[]).find((c) => anteriores[c]?.length)!;
    const alvo = total === 1 ? (n[primeiro] as (x: unknown) => string)(docAnterior(primeiro, anteriores[primeiro]![0].id as string)) : contagem(anteriores);
    const detalhe = mudancas.slice(0, 3).join(' · ') + (mudancas.length > 3 ? ` · +${mudancas.length - 3}` : '');
    descricao = `${alvo} — ${detalhe}`;
  } else {
    return null;
  }

  if (rotulo?.acao) acao = rotulo.acao;
  if (rotulo?.descricao) descricao = rotulo.descricao;

  let itensJson: string | undefined;
  if (acao === 'excluiu' || acao === 'editou') {
    const itens: ItensHistorico = { removidos, anteriores };
    itensJson = JSON.stringify(itens);
    if (itensJson.length > LIMITE_ITENS_JSON) {
      // talhões com contorno pesado: guarda sem o contorno
      itens.removidos.talhoes = itens.removidos.talhoes?.map(({ geometria: _g, ...t }) => t);
      itensJson = JSON.stringify(itens);
      if (itensJson.length > LIMITE_ITENS_JSON) itensJson = undefined;
    }
  }
  return { acao, descricao, itensJson };
}

/** Operações que desfazem uma entrada (reinsere os excluídos que não existem mais e devolve os valores anteriores). */
export function opsDeRestauracao(entrada: EntradaHistorico, atual: Dados): Operacao[] {
  if (!entrada.itensJson) return [];
  const itens = JSON.parse(entrada.itensJson) as ItensHistorico;
  const existe = (colecao: Colecao, id: string) => (atual[colecao] as { id: string }[]).some((x) => x.id === id);
  const ops: Operacao[] = [];
  for (const colecao of ['talhoes', 'coletas', 'amostras'] as Colecao[]) {
    for (const d of itens.removidos[colecao] ?? []) {
      const { id, ...dados } = d as { id: string } & Record<string, unknown>;
      if (!existe(colecao, id)) ops.push({ tipo: 'adicionar', colecao, id, dados });
    }
    for (const d of itens.anteriores[colecao] ?? []) {
      const { id, ...dados } = d as { id: string } & Record<string, unknown>;
      if (existe(colecao, id)) ops.push({ tipo: 'atualizar', colecao, id, dados });
    }
  }
  return ops;
}

// ---- Firestore ----

function ref(fs: Firestore, fazendaId: string) {
  return collection(fs, 'fazendas', fazendaId, 'historico');
}

/** Grava uma entrada (fora do lote dos dados: se as regras ainda não permitirem, só o histórico se perde). */
export function registrarHistorico(fs: Firestore, fazendaId: string, quem: string, e: Pick<EntradaHistorico, 'acao' | 'descricao' | 'itensJson'>) {
  const dados: Record<string, unknown> = { em: new Date().toISOString(), quem, acao: e.acao, descricao: e.descricao };
  if (e.itensJson) dados.itensJson = e.itensJson;
  return setDoc(doc(ref(fs, fazendaId), gerarId()), dados).catch((err) => console.warn('Histórico não gravado', err));
}

export function marcarRestaurado(fs: Firestore, fazendaId: string, id: string, porQuem: string) {
  return updateDoc(doc(ref(fs, fazendaId), id), { restauradoEm: new Date().toISOString(), restauradoPor: porQuem });
}

/** Últimas entradas, ao vivo (undefined carregando; null sem permissão/regras antigas). */
export function useHistorico(fs: Firestore | null, fazendaId: string, maximo = 80): EntradaHistorico[] | null | undefined {
  const [lista, setLista] = useState<EntradaHistorico[] | null | undefined>(undefined);
  useEffect(() => {
    if (!fs) return;
    return onSnapshot(
      query(ref(fs, fazendaId), orderBy('em', 'desc'), limit(maximo)),
      (snap) => setLista(snap.docs.map((d) => ({ ...(d.data() as Omit<EntradaHistorico, 'id'>), id: d.id }))),
      (e) => {
        console.warn('Histórico indisponível', e);
        setLista(null);
      },
    );
  }, [fs, fazendaId, maximo]);
  return lista;
}

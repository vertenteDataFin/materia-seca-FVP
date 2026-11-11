import { COLECOES, type Colecao, type Dados, type Entidade, type Novo } from './tipos';
import type { RotuloLote } from './historico';

/** Operação de um lote atômico. */
export type Operacao =
  | { tipo: 'adicionar'; colecao: Colecao; id: string; dados: Record<string, unknown> }
  | { tipo: 'atualizar'; colecao: Colecao; id: string; dados: Record<string, unknown> }
  | { tipo: 'remover'; colecao: Colecao; id: string };

/** O que o gancho de persistência recebe além das operações: o estado anterior (para o histórico) e o rótulo. */
export interface ContextoLote {
  anterior: Dados;
  rotulo?: RotuloLote;
}

/**
 * Fonte de dados do app (nuvem ou local). As escritas são síncronas do ponto de vista da interface:
 * o estado local muda na hora e a persistência acontece em segundo plano (offline-first).
 */
export interface Repositorio {
  /** Começa a ouvir/carregar os dados. */
  iniciar(): void;
  /** Para de ouvir e esquece os dados em memória. */
  parar(): void;
  /** Estado atual (undefined até a primeira carga). Referência estável enquanto nada muda. */
  obter(): Dados | undefined;
  assinar(cb: () => void): () => void;
  /** Resolve quando os dados já foram confirmados com a fonte de verdade (servidor ou disco). */
  aguardarPronto(): Promise<void>;
  /** Erros de persistência (ex.: permissão negada). */
  assinarErros(cb: (erro: Error) => void): () => void;

  novoId(): string;
  adicionar<C extends Colecao>(colecao: C, dados: Novo<Entidade<C>>, id?: string): string;
  atualizar<C extends Colecao>(colecao: C, id: string, dados: Partial<Novo<Entidade<C>>>): void;
  remover(colecao: Colecao, id: string): void;
  /** Várias operações de uma vez (atômicas na fonte). `rotulo` ajusta como o lote entra no histórico. */
  lote(ops: Operacao[], rotulo?: RotuloLote): void;
}

export function gerarId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

/** Remove chaves undefined (não são válidas em JSON nem no Firestore). */
export function semUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Base com estado em memória e notificação de assinantes. */
export class RepositorioMemoria implements Repositorio {
  protected dados: Dados | undefined;
  private assinantes = new Set<() => void>();
  private ouvintesErro = new Set<(e: Error) => void>();
  private resolverPronto: () => void = () => {};
  private pronto: Promise<void> = Promise.resolve();

  constructor(inicial?: Partial<Dados>) {
    this.reiniciarPronto();
    if (inicial) this.dados = { talhoes: [], coletas: [], amostras: [], ...inicial };
  }

  /** Volta ao estado "ainda não confirmado" (ao reiniciar/trocar de usuário). */
  protected reiniciarPronto() {
    this.pronto = new Promise<void>((r) => (this.resolverPronto = r));
  }

  iniciar() {
    if (!this.dados) this.dados = { talhoes: [], coletas: [], amostras: [] };
    this.marcarPronto();
    this.notificar();
  }
  parar() {
    this.dados = undefined;
    this.notificar();
  }
  obter() {
    return this.dados;
  }
  assinar(cb: () => void) {
    this.assinantes.add(cb);
    return () => void this.assinantes.delete(cb);
  }
  aguardarPronto() {
    return this.pronto;
  }
  assinarErros(cb: (e: Error) => void) {
    this.ouvintesErro.add(cb);
    return () => void this.ouvintesErro.delete(cb);
  }
  novoId() {
    return gerarId();
  }

  adicionar<C extends Colecao>(colecao: C, dados: Novo<Entidade<C>>, id = this.novoId()): string {
    this.lote([{ tipo: 'adicionar', colecao, id, dados: dados as Record<string, unknown> }]);
    return id;
  }
  atualizar<C extends Colecao>(colecao: C, id: string, dados: Partial<Novo<Entidade<C>>>) {
    this.lote([{ tipo: 'atualizar', colecao, id, dados: dados as Record<string, unknown> }]);
  }
  remover(colecao: Colecao, id: string) {
    this.lote([{ tipo: 'remover', colecao, id }]);
  }

  lote(ops: Operacao[], rotulo?: RotuloLote) {
    if (!this.dados) throw new Error('Repositório não iniciado.');
    const anterior = this.dados;
    const novo: Dados = { ...this.dados };
    const tocadas = new Set<Colecao>();
    for (const op of ops) {
      if (!tocadas.has(op.colecao)) {
        (novo as Record<Colecao, unknown[]>)[op.colecao] = [...novo[op.colecao]];
        tocadas.add(op.colecao);
      }
      const lista = novo[op.colecao] as { id: string }[];
      if (op.tipo === 'adicionar') lista.push(semUndefined({ ...op.dados, id: op.id }) as { id: string });
      else {
        const i = lista.findIndex((x) => x.id === op.id);
        if (i < 0) continue;
        if (op.tipo === 'remover') lista.splice(i, 1);
        else lista[i] = semUndefined({ ...lista[i], ...op.dados, id: op.id }) as { id: string };
      }
    }
    this.dados = novo;
    this.persistir(ops, novo, { anterior, rotulo });
    this.notificar();
  }

  /** Gancho para subclasses gravarem as mudanças. */
  protected persistir(_ops: Operacao[], _estado: Dados, _contexto: ContextoLote): void {}

  protected substituir(dados: Dados) {
    this.dados = dados;
    this.notificar();
  }
  protected marcarPronto() {
    this.resolverPronto();
  }
  protected notificar() {
    for (const cb of this.assinantes) cb();
  }
  protected falhar(e: unknown) {
    const erro = e instanceof Error ? e : new Error(String(e));
    console.error(erro);
    for (const cb of this.ouvintesErro) cb(erro);
  }
}

const BANCO_LOCAL = 'silagem-ms-local';
const CHAVE_LOCAL = 'dados';

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(BANCO_LOCAL, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function lerLocal(): Promise<Dados | undefined> {
  const banco = await abrirBanco();
  return new Promise((res, rej) => {
    const req = banco.transaction('kv').objectStore('kv').get(CHAVE_LOCAL);
    req.onsuccess = () => res(req.result as Dados | undefined);
    req.onerror = () => rej(req.error);
  });
}

async function gravarLocal(d: Dados): Promise<void> {
  const banco = await abrirBanco();
  return new Promise((res, rej) => {
    const tx = banco.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(d, CHAVE_LOCAL);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Só neste aparelho (IndexedDB), usado quando o Firebase não está configurado. */
export class RepositorioLocal extends RepositorioMemoria {
  private gravando: Promise<void> = Promise.resolve();
  private pendente: Dados | null = null;

  override iniciar() {
    lerLocal()
      .then((d) => {
        this.substituir(d ?? { talhoes: [], coletas: [], amostras: [] });
        this.marcarPronto();
      })
      .catch((e) => {
        this.falhar(e);
        this.substituir({ talhoes: [], coletas: [], amostras: [] });
        this.marcarPronto();
      });
  }

  protected override persistir(_ops: Operacao[], estado: Dados) {
    // Serializa as gravações; se chegarem várias enquanto grava, guarda só a última.
    this.pendente = estado;
    this.gravando = this.gravando.then(async () => {
      while (this.pendente) {
        const d = this.pendente;
        this.pendente = null;
        await gravarLocal(d).catch((e) => this.falhar(e));
      }
    });
  }

  /** Aguarda as gravações pendentes (testes). */
  aguardarGravacao() {
    return this.gravando;
  }
}

export { COLECOES };

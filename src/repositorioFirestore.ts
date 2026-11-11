import { collection, doc, onSnapshot, writeBatch, type Firestore } from 'firebase/firestore';
import { descreverLote, registrarHistorico } from './historico';
import { RepositorioMemoria, semUndefined, type ContextoLote, type Operacao } from './repositorio';
import { COLECOES, type Colecao, type Dados } from './tipos';

/** Converte um registro para o formato do documento (Firestore não aceita arrays aninhados: contorno vira JSON). */
export function paraDocumento(dados: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, geometria, ...resto } = dados;
  const d: Record<string, unknown> = { ...resto };
  if ('geometria' in dados) d.geometriaJson = geometria ? JSON.stringify(geometria) : null;
  return semUndefined(d);
}

export function deDocumento<T>(id: string, dados: Record<string, unknown>): T {
  const { geometriaJson, ...resto } = dados;
  const r: Record<string, unknown> = { ...resto, id };
  if (typeof geometriaJson === 'string') {
    try {
      r.geometria = JSON.parse(geometriaJson);
    } catch {
      /* contorno ilegível: ignora */
    }
  }
  return r as T;
}

/**
 * Dados da fazenda no Firestore (fazendas/<id>/talhoes|coletas|amostras), com cache offline do SDK.
 * As escritas atualizam a memória na hora e vão para o servidor quando houver conexão.
 */
export class RepositorioFirestore extends RepositorioMemoria {
  private cancelar: (() => void)[] = [];
  private parciais: Partial<Dados> = {};
  private confirmadas = new Set<Colecao>();

  constructor(
    private fs: Firestore,
    private fazendaId: string,
    /** E-mail de quem está logado: assina as entradas do histórico. */
    private autor = '',
  ) {
    super();
  }

  definirAutor(email: string) {
    this.autor = email;
  }

  private ref(colecao: Colecao) {
    return collection(this.fs, 'fazendas', this.fazendaId, colecao);
  }

  override iniciar() {
    this.parar();
    this.reiniciarPronto();
    for (const colecao of COLECOES) {
      const cancelar = onSnapshot(
        this.ref(colecao),
        { includeMetadataChanges: true },
        (snap) => {
          (this.parciais as Record<Colecao, unknown[]>)[colecao] = snap.docs.map((d) => deDocumento(d.id, d.data()));
          if (!snap.metadata.fromCache) this.confirmadas.add(colecao);
          if (COLECOES.every((c) => this.parciais[c])) this.substituir({ ...(this.parciais as Dados) });
          if (this.confirmadas.size === COLECOES.length) this.marcarPronto();
        },
        (e) => this.falhar(e),
      );
      this.cancelar.push(cancelar);
    }
  }

  override parar() {
    for (const c of this.cancelar) c();
    this.cancelar = [];
    this.parciais = {};
    this.confirmadas.clear();
    super.parar();
  }

  protected override persistir(ops: Operacao[], _estado: Dados, contexto: ContextoLote) {
    const lote = writeBatch(this.fs);
    for (const op of ops) {
      const ref = doc(this.ref(op.colecao), op.id);
      if (op.tipo === 'adicionar') lote.set(ref, paraDocumento(op.dados));
      else if (op.tipo === 'atualizar') lote.update(ref, paraDocumento(op.dados));
      else lote.delete(ref);
    }
    lote.commit().catch((e) => this.falhar(e));
    const entrada = descreverLote(ops, contexto.anterior, contexto.rotulo);
    if (entrada) void registrarHistorico(this.fs, this.fazendaId, this.autor, entrada);
  }
}

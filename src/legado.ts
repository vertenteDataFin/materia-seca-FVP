import Dexie, { type Table } from 'dexie';

/**
 * Banco local da versão anterior do app (Dexie, ids numéricos). Mantido só para migrar os dados
 * que já estavam no aparelho para a fonte de dados atual.
 */
export interface TalhaoLegado {
  id?: number;
  nome: string;
  areaHa: number;
  capim: string;
  capimKml?: string;
  areaKmlHa?: number;
  fazenda?: string;
  geometria?: [number, number][][];
  observacoes?: string;
}
export interface ColetaLegada {
  id?: number;
  talhaoId: number;
  data: string;
  responsavel: string;
  areaAmostralM2: number;
  observacoes?: string;
}
export interface AmostraLegada {
  id?: number;
  coletaId: number;
  ponto: number;
  pesoVerdeKg: number | null;
  pesoUmidoG: number | null;
  pesoSecoG: number | null;
  lat?: number | null;
  lng?: number | null;
  precisaoM?: number | null;
  capturadoEm?: string | null;
  observacoes?: string;
}

export const NOME_BANCO_LEGADO = 'silagem-ms';

class BancoLegado extends Dexie {
  talhoes!: Table<TalhaoLegado, number>;
  coletas!: Table<ColetaLegada, number>;
  amostras!: Table<AmostraLegada, number>;

  constructor() {
    super(NOME_BANCO_LEGADO);
    this.version(1).stores({
      talhoes: '++id, nome',
      coletas: '++id, talhaoId, data',
      amostras: '++id, coletaId',
    });
  }
}

export interface DadosLegados {
  talhoes: TalhaoLegado[];
  coletas: ColetaLegada[];
  amostras: AmostraLegada[];
}

/** Lê tudo do banco antigo; null se ele não existir neste aparelho. */
export async function lerLegado(): Promise<DadosLegados | null> {
  if (typeof indexedDB === 'undefined' || !(await Dexie.exists(NOME_BANCO_LEGADO))) return null;
  const db = new BancoLegado();
  try {
    const [talhoes, coletas, amostras] = await Promise.all([db.talhoes.toArray(), db.coletas.toArray(), db.amostras.toArray()]);
    return { talhoes, coletas, amostras };
  } finally {
    db.close();
  }
}

/** Grava no banco antigo (usado nos testes para simular um aparelho com a versão anterior). */
export async function gravarLegado(d: DadosLegados) {
  const db = new BancoLegado();
  try {
    await db.transaction('rw', db.talhoes, db.coletas, db.amostras, async () => {
      await db.talhoes.bulkAdd(d.talhoes);
      await db.coletas.bulkAdd(d.coletas);
      await db.amostras.bulkAdd(d.amostras);
    });
  } finally {
    db.close();
  }
}

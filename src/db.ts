import Dexie, { type Table } from 'dexie';

/** Área de produção (talhão). */
export interface Talhao {
  id?: number;
  nome: string;
  areaHa: number;
  /** Capim em uso (editável; começa igual ao do KML). */
  capim: string;
  /** Capim/atividade conforme o KML importado. */
  capimKml?: string;
  /** Área declarada no KML (ha). */
  areaKmlHa?: number;
  fazenda?: string;
  /** Contorno do talhão (anéis externos [lng, lat]), importado de KML. */
  geometria?: [number, number][][];
  observacoes?: string;
}

/** Evento de amostragem em um talhão (uma ida a campo). */
export interface Coleta {
  id?: number;
  talhaoId: number;
  data: string; // AAAA-MM-DD
  responsavel: string;
  /** Área do quadro/moldura de amostragem, em m² (ex.: 1 m², 0,25 m²). */
  areaAmostralM2: number;
  observacoes?: string;
}

/** Um ponto amostrado dentro de uma coleta. */
export interface Amostra {
  id?: number;
  coletaId: number;
  ponto: number;
  /** Massa verde cortada dentro do quadro, em kg. */
  pesoVerdeKg: number | null;
  /** Subamostra para umidade: peso úmido (g), já descontada a tara. */
  pesoUmidoG: number | null;
  /** Subamostra para umidade: peso seco após estufa/micro-ondas (g), já descontada a tara. */
  pesoSecoG: number | null;
  /** Posição GPS do ponto coletado (WGS84). */
  lat?: number | null;
  lng?: number | null;
  /** Precisão informada pelo GPS, em metros. */
  precisaoM?: number | null;
  /** Instante da captura (ISO). */
  capturadoEm?: string | null;
  observacoes?: string;
}

class SilagemDB extends Dexie {
  talhoes!: Table<Talhao, number>;
  coletas!: Table<Coleta, number>;
  amostras!: Table<Amostra, number>;

  constructor() {
    super('silagem-ms');
    this.version(1).stores({
      talhoes: '++id, nome',
      coletas: '++id, talhaoId, data',
      amostras: '++id, coletaId',
    });
  }
}

export const db = new SilagemDB();

/** Ordem natural de nomes: "Talhão 13" < "Talhão 17A" < "Talhão 18" < "Talhão C3" (não 1, 10, 13, 2…). */
export function compararNomes(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Todos os talhões em ordem alfabética natural pelo nome. */
export async function listarTalhoes(): Promise<Talhao[]> {
  return (await db.talhoes.toArray()).sort((a, b) => compararNomes(a.nome, b.nome));
}

/** Exclui um talhão e todas as suas coletas e amostras. */
export async function excluirTalhao(id: number) {
  await db.transaction('rw', db.talhoes, db.coletas, db.amostras, async () => {
    const coletaIds = (await db.coletas.where('talhaoId').equals(id).primaryKeys()) as number[];
    await db.amostras.where('coletaId').anyOf(coletaIds).delete();
    await db.coletas.bulkDelete(coletaIds);
    await db.talhoes.delete(id);
  });
}

/** Exclui uma coleta e suas amostras. */
export async function excluirColeta(id: number) {
  await db.transaction('rw', db.coletas, db.amostras, async () => {
    await db.amostras.where('coletaId').equals(id).delete();
    await db.coletas.delete(id);
  });
}

/** Área de produção (talhão). */
export interface Talhao {
  id: string;
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
  id: string;
  talhaoId: string;
  data: string; // AAAA-MM-DD
  responsavel: string;
  /** Área do quadro/moldura de amostragem, em m² (ex.: 1 m², 0,25 m²). */
  areaAmostralM2: number;
  observacoes?: string;
  /** Instante de criação (ISO) — desempate na ordenação. */
  criadoEm?: string;
}

/** Um ponto amostrado dentro de uma coleta. */
export interface Amostra {
  id: string;
  coletaId: string;
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

/** Registro ainda sem id (antes de gravar). */
export type Novo<T extends { id: string }> = Omit<T, 'id'>;

export interface Dados {
  talhoes: Talhao[];
  coletas: Coleta[];
  amostras: Amostra[];
}

export type Colecao = keyof Dados;
export type Entidade<C extends Colecao> = Dados[C][number];

export const COLECOES: Colecao[] = ['talhoes', 'coletas', 'amostras'];

/** Ordem natural de nomes: "Talhão 13" < "Talhão 17A" < "Talhão 18" < "Talhão C3" (não 1, 10, 13, 2…). */
export function compararNomes(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Mais recente primeiro: por data, depois por instante de criação, depois id. */
export function compararColetasDesc(a: Coleta, b: Coleta): number {
  return b.data.localeCompare(a.data) || (b.criadoEm ?? '').localeCompare(a.criadoEm ?? '') || b.id.localeCompare(a.id);
}

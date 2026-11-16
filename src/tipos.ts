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
  /** Colheita marcada como finalizada (data AAAA-MM-DD); null/ausente = não finalizada. */
  colheitaFinalizadaEm?: string | null;
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
  /** De onde veio a posição: lida no GPS do aparelho ou marcada tocando no mapa. Pontos antigos sem o campo: ver origemPosicao(). */
  origemPos?: 'gps' | 'mapa' | null;
  observacoes?: string;
}

/**
 * Carga de silagem (um caminhão). Registrada em duas etapas: no campo (talhão e saída) e na balança
 * (pesos). A carga fica "aguardando pesagem" até o peso ser lançado; com o peso, está encerrada.
 */
export interface Carga {
  id: string;
  talhaoId: string;
  /** Saída do campo (ISO, data e hora local "AAAA-MM-DDTHH:mm"). */
  saidaEm: string;
  placa?: string;
  /** Motorista do caminhão (copiado do cadastro de veículos ao registrar a carga). */
  motorista?: string;
  silo?: string;
  /** Peso bruto na balança (kg). */
  pesoBrutoKg: number | null;
  /** Tara do caminhão (kg). */
  taraKg: number | null;
  /** Instante da pesagem (ISO). */
  pesadoEm?: string | null;
  ticket?: string;
  /** MS da carga (%), se amostrada na colheita; sem ela vale a MS da última amostragem do talhão. */
  msPct?: number | null;
  observacoes?: string;
  criadoEm?: string;
}

/** Veículo da colheita (caminhão): motorista e placa. A tara vem das pesagens da placa. */
export interface Veiculo {
  id: string;
  /** Nº de cadastro (da relação de veículos). */
  numero?: number;
  motorista: string;
  /** Placa em maiúsculas, sem hífen (ex.: "CPG0247"). */
  placa: string;
  criadoEm?: string;
}

/** Registro ainda sem id (antes de gravar). */
export type Novo<T extends { id: string }> = Omit<T, 'id'>;

export interface Dados {
  talhoes: Talhao[];
  coletas: Coleta[];
  amostras: Amostra[];
  cargas: Carga[];
  veiculos: Veiculo[];
}

export type Colecao = keyof Dados;
export type Entidade<C extends Colecao> = Dados[C][number];

export const COLECOES: Colecao[] = ['talhoes', 'coletas', 'amostras', 'cargas', 'veiculos'];

/** Estado vazio (todas as coleções). */
export function dadosVazios(): Dados {
  return { talhoes: [], coletas: [], amostras: [], cargas: [], veiculos: [] };
}

/** Completa um estado salvo antes de existirem coleções novas (ex.: cargas). */
export function completarDados(d: Partial<Dados> | undefined): Dados {
  return { ...dadosVazios(), ...(d ?? {}) };
}

/** Ordem natural de nomes: "Talhão 13" < "Talhão 17A" < "Talhão 18" < "Talhão C3" (não 1, 10, 13, 2…). */
export function compararNomes(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Mais recente primeiro: por data, depois por instante de criação, depois id. */
export function compararColetasDesc(a: Coleta, b: Coleta): number {
  return b.data.localeCompare(a.data) || (b.criadoEm ?? '').localeCompare(a.criadoEm ?? '') || b.id.localeCompare(a.id);
}

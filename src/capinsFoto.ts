import { chaveNome } from './kml';

/** Capim por talhão conforme o mapa/foto da fazenda (rótulos escritos sobre a imagem de satélite). */
export const CAPIM_FOTO: Record<string, string> = {
  'Pivô 1': 'Miyagi',
  'Pivô 2': 'Miyagi',
  'C3': 'Piatã',
  'TL 13': 'Miyagi/Mombaça',
  'TL 17A': 'Miyagi/Mombaça',
  'TL 17B': 'Miyagi/Mombaça',
  'TL 17C': 'Miyagi',
  'TL 17D': 'Mombaça',
  'TL 17E': 'Mombaça',
  'TL 18': 'Miyagi',
  'TL 20': 'Piatã',
  'TL 21': 'Mombaça',
  'TL 23': 'Mombaça',
  'Cauã 1': 'Miyagi/Mombaça',
};

const POR_CHAVE = new Map(Object.entries(CAPIM_FOTO).map(([nome, capim]) => [chaveNome(nome), capim]));

/** Capim da foto para um talhão (qualquer grafia: "PD - TALHAO 17 A", "TL 17A"…). */
export function capimFoto(nomeTalhao: string): string | undefined {
  return POR_CHAVE.get(chaveNome(nomeTalhao));
}

/** Compara capins ignorando acento, caixa, espaços e ordem das espécies ("Mombaça/Miyagi" = "Miyagi/Mombaça"). */
export function mesmoCapim(a: string | undefined, b: string | undefined): boolean {
  const norm = (s: string | undefined) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split('/')
      .map((x) => x.trim())
      .filter(Boolean)
      .sort()
      .join('/');
  return norm(a) === norm(b);
}

/** Silos da fazenda: as opções de destino na amostragem de colheita. */
export const SILOS = ['Trincheira 1', 'Trincheira 2', 'Trincheira 3', 'Trincheira 4', 'Trincheira 5', 'Trincheira 6', 'Trincheira 7'];

/**
 * Nome padronizado do silo: "TRINCHEIRA 01", "trincheira 1" e "Trincheira 01" viram "Trincheira 1".
 * Outros nomes ficam como estão (só sem espaços nas pontas).
 */
export function nomeSilo(s: string | null | undefined): string {
  const v = (s ?? '').trim();
  const m = v.match(/^trincheira\s*0*(\d+)$/i);
  return m ? `Trincheira ${m[1]}` : v;
}

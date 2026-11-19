import { dentroDoTalhao, distanciaM } from './geo';
import type { Talhao } from './tipos';

/** Centro aproximado do talhão (média dos vértices do maior anel); null sem contorno. */
export function centroTalhao(t: Pick<Talhao, 'geometria'>): { lat: number; lng: number } | null {
  const anel = [...(t.geometria ?? [])].sort((a, b) => b.length - a.length)[0];
  if (!anel?.length) return null;
  const lng = anel.reduce((s, p) => s + p[0], 0) / anel.length;
  const lat = anel.reduce((s, p) => s + p[1], 0) / anel.length;
  return { lat, lng };
}

export interface TalhaoProximo<T> {
  talhao: T;
  /** Distância até o centro do talhão, em metros (0 quando está dentro). */
  distanciaM: number;
  dentro: boolean;
}

/**
 * Talhões ordenados pela posição de quem está no campo: primeiro aquele em que a pessoa está dentro,
 * depois os mais próximos. Talhões sem contorno ficam de fora.
 */
export function talhoesPorPosicao<T extends Pick<Talhao, 'geometria'>>(talhoes: T[], pos: { lat: number; lng: number }): TalhaoProximo<T>[] {
  const lista: TalhaoProximo<T>[] = [];
  for (const t of talhoes) {
    const c = centroTalhao(t);
    if (!c) continue;
    const dentro = dentroDoTalhao(pos.lng, pos.lat, t.geometria) === true;
    lista.push({ talhao: t, dentro, distanciaM: dentro ? 0 : distanciaM(pos, c) });
  }
  return lista.sort((a, b) => Number(b.dentro) - Number(a.dentro) || a.distanciaM - b.distanciaM);
}

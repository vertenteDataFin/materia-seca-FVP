export interface Posicao {
  lat: number;
  lng: number;
  precisaoM: number | null;
  capturadoEm: string;
}

export type OrigemPosicao = 'gps' | 'mapa';

export const ROTULO_ORIGEM: Record<OrigemPosicao, string> = { gps: 'GPS do celular', mapa: 'marcado no mapa' };

/**
 * Origem da posição de um ponto. Pontos gravados antes do campo `origemPos` são deduzidos:
 * o GPS sempre informa a precisão (precisaoM); o toque no mapa, não.
 */
export function origemPosicao(a: { lat?: number | null; lng?: number | null; precisaoM?: number | null; origemPos?: OrigemPosicao | null }): OrigemPosicao | null {
  if (a.lat == null || a.lng == null) return null;
  if (a.origemPos) return a.origemPos;
  return a.precisaoM != null ? 'gps' : 'mapa';
}

/** Texto da origem para listas e exportações ('' se o ponto não tem posição). */
export function rotuloOrigem(a: Parameters<typeof origemPosicao>[0]): string {
  const o = origemPosicao(a);
  return o ? ROTULO_ORIGEM[o] : '';
}

/** Lê a posição atual do GPS do aparelho (alta precisão). */
export function capturarPosicao(timeoutMs = 20000): Promise<Posicao> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este aparelho/navegador não tem GPS disponível.'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precisaoM: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
          capturadoEm: new Date(p.timestamp).toISOString(),
        }),
      (e) => {
        const msg =
          e.code === e.PERMISSION_DENIED
            ? 'Permissão de localização negada. Libere nas configurações do navegador.'
            : e.code === e.TIMEOUT
              ? 'GPS demorou demais. Vá para céu aberto e tente de novo.'
              : 'Não foi possível obter a posição.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** Ponto dentro de um anel [lng, lat] (ray casting). */
export function dentroDoAnel(lng: number, lat: number, anel: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Ponto dentro de algum dos anéis do talhão. */
export function dentroDoTalhao(lng: number, lat: number, geometria: [number, number][][] | undefined): boolean | null {
  if (!geometria?.length) return null;
  return geometria.some((anel) => dentroDoAnel(lng, lat, anel));
}

/** Distância aproximada entre dois pontos, em metros (haversine). */
export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

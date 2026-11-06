import { describe, expect, it } from 'vitest';
import { dentroDoAnel, dentroDoTalhao, distanciaM } from './geo';

const quadrado: [number, number][] = [[-52.0, -19.0], [-51.99, -19.0], [-51.99, -19.01], [-52.0, -19.01], [-52.0, -19.0]];

describe('geo', () => {
  it('detecta ponto dentro/fora do polígono', () => {
    expect(dentroDoAnel(-51.995, -19.005, quadrado)).toBe(true);
    expect(dentroDoAnel(-51.98, -19.005, quadrado)).toBe(false);
    expect(dentroDoTalhao(-51.995, -19.005, [quadrado])).toBe(true);
    expect(dentroDoTalhao(-51.995, -19.005, undefined)).toBeNull();
  });

  it('calcula distância em metros', () => {
    // 0,01° de latitude ≈ 1.11 km
    expect(distanciaM({ lat: -19.0, lng: -52.0 }, { lat: -19.01, lng: -52.0 })).toBeCloseTo(1112, -1);
  });
});

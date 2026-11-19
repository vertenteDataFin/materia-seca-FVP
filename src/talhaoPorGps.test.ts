import { describe, expect, it } from 'vitest';
import { centroTalhao, talhoesPorPosicao } from './talhaoPorGps';

const quadrado = (lng: number, lat: number, d = 0.001): [number, number][][] => [
  [[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d]],
];

describe('talhoesPorPosicao', () => {
  const talhoes = [
    { id: 'longe', geometria: quadrado(-48.1, -20.1) },
    { id: 'perto', geometria: quadrado(-48.003, -20) },
    { id: 'aqui', geometria: quadrado(-48, -20) },
    { id: 'sem-contorno', geometria: undefined },
  ];

  it('põe primeiro o talhão onde a pessoa está e depois os mais próximos; sem contorno fica de fora', () => {
    const r = talhoesPorPosicao(talhoes, { lat: -19.9995, lng: -47.9995 });
    expect(r.map((x) => x.talhao.id)).toEqual(['aqui', 'perto', 'longe']);
    expect(r[0].dentro).toBe(true);
    expect(r[0].distanciaM).toBe(0);
    expect(r[1].dentro).toBe(false);
    expect(r[1].distanciaM).toBeGreaterThan(100);
  });

  it('dentro de outro talhão: ele vem primeiro', () => {
    const r = talhoesPorPosicao(talhoes, { lat: -20.0995, lng: -48.0995 });
    expect(r[0].talhao.id).toBe('longe');
    expect(r[0].dentro).toBe(true);
  });

  it('fora de todos: só ordena por distância', () => {
    const r = talhoesPorPosicao(talhoes, { lat: -20.01, lng: -48.0 });
    expect(r.every((x) => !x.dentro)).toBe(true);
    expect(r.map((x) => x.talhao.id)).toEqual(['aqui', 'perto', 'longe']);
  });

  it('centro do talhão', () => {
    const c = centroTalhao({ geometria: quadrado(-48, -20, 0.002) })!;
    expect(c.lng).toBeCloseTo(-47.999);
    expect(c.lat).toBeCloseTo(-19.999);
    expect(centroTalhao({ geometria: [] })).toBeNull();
  });
});

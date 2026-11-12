import { describe, expect, it } from 'vitest';
import { origemPosicao, rotuloOrigem } from './geo';

describe('origemPosicao', () => {
  it('sem posição não tem origem', () => {
    expect(origemPosicao({})).toBeNull();
    expect(origemPosicao({ lat: null, lng: null, origemPos: 'gps' })).toBeNull();
    expect(rotuloOrigem({})).toBe('');
  });

  it('usa o campo gravado quando existe', () => {
    expect(origemPosicao({ lat: -19.4, lng: -52.6, precisaoM: 8, origemPos: 'mapa' })).toBe('mapa');
    expect(origemPosicao({ lat: -19.4, lng: -52.6, precisaoM: null, origemPos: 'gps' })).toBe('gps');
  });

  it('deduz pontos antigos pela precisão: GPS informa precisão, toque no mapa não', () => {
    expect(origemPosicao({ lat: -19.4, lng: -52.6, precisaoM: 12 })).toBe('gps');
    expect(origemPosicao({ lat: -19.4, lng: -52.6, precisaoM: null })).toBe('mapa');
    expect(origemPosicao({ lat: -19.4, lng: -52.6 })).toBe('mapa');
    expect(rotuloOrigem({ lat: -19.4, lng: -52.6, precisaoM: 12 })).toBe('GPS do celular');
    expect(rotuloOrigem({ lat: -19.4, lng: -52.6 })).toBe('marcado no mapa');
  });
});

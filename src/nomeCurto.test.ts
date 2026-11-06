// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nomeCurto } from './MapaTalhoes';

describe('nomeCurto', () => {
  it('abrevia como na foto da fazenda', () => {
    expect(nomeCurto('PD - TALHAO 17 A')).toBe('TL 17A');
    expect(nomeCurto('PD- TALHÃO 17 D')).toBe('TL 17D');
    expect(nomeCurto('PD - TALHAO 13')).toBe('TL 13');
    expect(nomeCurto('PIVO 01')).toBe('Pivô 1');
    expect(nomeCurto('CONF - TALHAO C3')).toBe('C3');
    expect(nomeCurto('CONF - TALHAO 21 — CAPIM MOMBACA')).toBe('TL 21');
    expect(nomeCurto('Cauã 1')).toBe('Cauã 1');
  });
});

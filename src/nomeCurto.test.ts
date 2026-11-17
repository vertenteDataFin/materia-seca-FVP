// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nomeComSigla, nomeCurto } from './MapaTalhoes';

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

  it('abrevia o nome no padrão do app', () => {
    expect(nomeCurto('Talhão 17A - PD')).toBe('TL 17A');
    expect(nomeCurto('Talhão 18 - PD')).toBe('TL 18');
    expect(nomeCurto('Pivô 1 - Conf')).toBe('Pivô 1');
    expect(nomeCurto('Talhão C3 - Conf')).toBe('C3');
    expect(nomeCurto('Talhão 17A Miyagi - PD')).toBe('TL 17A Miyagi');
    expect(nomeCurto('Talhão 13B - PD')).toBe('TL 13B');
  });
});

describe('nomeComSigla', () => {
  it('mantém a identificação do local que vem do KML', () => {
    expect(nomeComSigla('Talhão 18 - PD')).toBe('TL 18 - PD');
    expect(nomeComSigla('Pivô 1 - Conf')).toBe('Pivô 1 - Conf');
    expect(nomeComSigla('Talhão 2A - CA')).toBe('TL 2A - CA');
    expect(nomeComSigla('Talhão 17A Miyagi - PD')).toBe('TL 17A Miyagi - PD');
    expect(nomeComSigla('Talhão C3 - Conf')).toBe('C3 - Conf');
    // nome do KML ainda no formato antigo: sigla no começo
    expect(nomeComSigla('PD - TALHAO 17 A')).toBe('TL 17A - PD');
    expect(nomeComSigla('CONF - TALHAO 21 — CAPIM MOMBACA')).toBe('TL 21 - Conf');
    // sem sigla no nome: a da fazenda; sem fazenda, só o nome curto
    expect(nomeComSigla('Talhão 5', 'Cascata')).toBe('TL 5 - CA');
    expect(nomeComSigla('Talhão 5')).toBe('TL 5');
  });
});

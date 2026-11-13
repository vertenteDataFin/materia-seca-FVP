import { describe, expect, it } from 'vitest';
import { lancarSeco, teorMS, UMIDO_PADRAO_G } from './calc';

describe('lancarSeco', () => {
  it('preenche o úmido com 100 g quando estava em branco, e o seco vira a MS direto', () => {
    const dados = lancarSeco({ pesoUmidoG: null }, 24);
    expect(dados).toEqual({ pesoSecoG: 24, pesoUmidoG: UMIDO_PADRAO_G });
    expect(teorMS({ pesoUmidoG: dados.pesoUmidoG!, pesoSecoG: 24 })).toBe(24);
  });

  it('não mexe num úmido já informado', () => {
    expect(lancarSeco({ pesoUmidoG: 120 }, 30)).toEqual({ pesoSecoG: 30 });
  });

  it('apagar o seco não inventa úmido', () => {
    expect(lancarSeco({ pesoUmidoG: null }, null)).toEqual({ pesoSecoG: null });
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { codigoAmostra, statusColeta } from './fluxo';
import type { Amostra } from './tipos';

const am = (p: Partial<Amostra>): Amostra => ({ id: 'x', coletaId: 'c', ponto: 1, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null, ...p });

describe('fluxo campo → laboratório', () => {
  it('gera o código da etiqueta', () => {
    expect(codigoAmostra('Talhão 18 - PD', '2026-11-07', 3)).toBe('TL18-0711-P3');
    expect(codigoAmostra('Pivô 1 - Conf', '2026-11-09', 12)).toBe('PIVÔ1-0911-P12');
    expect(codigoAmostra('Talhão C3 - Conf', '2026-11-09', 1)).toBe('C3-0911-P1');
  });

  it('classifica a coleta', () => {
    expect(statusColeta([])).toBe('semPontos');
    expect(statusColeta([am({ pesoVerdeKg: 2 }), am({})])).toBe('campo');
    expect(statusColeta([am({ pesoVerdeKg: 2 }), am({ pesoVerdeKg: 1, pesoUmidoG: 100, pesoSecoG: 22 })])).toBe('laboratorio');
    expect(statusColeta([am({ pesoVerdeKg: 2, pesoUmidoG: 100, pesoSecoG: 22 })])).toBe('completa');
    // seco > úmido é inválido: continua pendente
    expect(statusColeta([am({ pesoVerdeKg: 2, pesoUmidoG: 10, pesoSecoG: 22 })])).toBe('laboratorio');
  });
});

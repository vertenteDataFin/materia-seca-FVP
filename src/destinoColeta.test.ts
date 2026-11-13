import { describe, expect, it } from 'vitest';
import { destinoColeta } from './pages/Coletas';

describe('destinoColeta', () => {
  it('leva para a etapa pendente, o laboratório ou o resultado conforme a situação', () => {
    expect(destinoColeta('c1', 'semPontos')).toBe('/coletas/c1/pontos');
    expect(destinoColeta('c1', 'campo')).toBe('/coletas/c1/pesos');
    expect(destinoColeta('c1', 'laboratorio')).toBe('/laboratorio?coleta=c1');
    expect(destinoColeta('c1', 'completa')).toBe('/coletas/c1');
  });
});

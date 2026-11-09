import { describe, expect, it } from 'vitest';
import { PARAMETROS_PADRAO, statusMS } from './calc';
import { semaforoDe } from './semaforo';

describe('semáforo', () => {
  it('verde na faixa, vermelho fora, amarelo sem MS', () => {
    expect(semaforoDe(statusMS(30, PARAMETROS_PADRAO))).toBe('verde');
    expect(semaforoDe(statusMS(28, PARAMETROS_PADRAO))).toBe('verde');
    expect(semaforoDe(statusMS(23.7, PARAMETROS_PADRAO))).toBe('vermelho');
    expect(semaforoDe(statusMS(40, PARAMETROS_PADRAO))).toBe('vermelho');
    expect(semaforoDe(statusMS(null, PARAMETROS_PADRAO))).toBe('amarelo');
    expect(semaforoDe(null)).toBe('amarelo');
  });
});

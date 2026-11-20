import { describe, expect, it } from 'vitest';
import { carregarModulo, ehFalhaDeVersao } from './carregarModulo';

describe('carregarModulo', () => {
  it('reconhece o erro de módulo de versão antiga (Chrome, Safari, Firefox)', () => {
    expect(ehFalhaDeVersao(new TypeError('Failed to fetch dynamically imported module: https://x/assets/exceljs.min-B-otBYZJ.js'))).toBe(true);
    expect(ehFalhaDeVersao(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(ehFalhaDeVersao(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(ehFalhaDeVersao(new Error('Arquivo inválido'))).toBe(false);
  });

  it('devolve o módulo e repassa outros erros', async () => {
    await expect(carregarModulo(async () => 42)).resolves.toBe(42);
    await expect(carregarModulo(async () => { throw new Error('Arquivo inválido'); })).rejects.toThrow('Arquivo inválido');
  });
});

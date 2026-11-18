import { describe, expect, it } from 'vitest';
import { nomeSilo, SILOS } from './silos';

describe('silos', () => {
  it('lista fixa: Trincheira 1 a 5', () => {
    expect(SILOS).toEqual(['Trincheira 1', 'Trincheira 2', 'Trincheira 3', 'Trincheira 4', 'Trincheira 5']);
  });

  it('padroniza o nome que vem da balança ou de registros antigos', () => {
    expect(nomeSilo('Trincheira 01')).toBe('Trincheira 1');
    expect(nomeSilo('TRINCHEIRA 03')).toBe('Trincheira 3');
    expect(nomeSilo(' trincheira 5 ')).toBe('Trincheira 5');
    expect(nomeSilo('Trincheira 10')).toBe('Trincheira 10');
    expect(nomeSilo('Silo 1')).toBe('Silo 1');
    expect(nomeSilo(undefined)).toBe('');
  });
});

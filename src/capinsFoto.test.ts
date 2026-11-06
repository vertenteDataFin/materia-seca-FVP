import { describe, expect, it } from 'vitest';
import { capimFoto, mesmoCapim } from './capinsFoto';

describe('capinsFoto', () => {
  it('encontra o capim da foto por qualquer grafia do nome', () => {
    expect(capimFoto('PD - TALHAO 17 C')).toBe('Miyagi');
    expect(capimFoto('TL 17C')).toBe('Miyagi');
    expect(capimFoto('PIVO 01')).toBe('Miyagi');
    expect(capimFoto('CONF - TALHAO C3')).toBe('Piatã');
    expect(capimFoto('PD - TALHAO 19')).toBeUndefined(); // não está na foto
  });

  it('compara capins sem depender de ordem/acento', () => {
    expect(mesmoCapim('Mombaça/Miyagi', 'Miyagi/Mombaça')).toBe(true);
    expect(mesmoCapim('mombaca', 'Mombaça')).toBe(true);
    expect(mesmoCapim('Mombaça', 'Miyagi/Mombaça')).toBe(false);
    expect(mesmoCapim('Mombaça/Compostagem', 'Mombaça')).toBe(false);
  });
});

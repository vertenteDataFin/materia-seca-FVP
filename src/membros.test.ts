import { describe, expect, it } from 'vitest';
import { nomeDaConta, type Membro } from './membros';

describe('nomeDaConta', () => {
  const membros: Membro[] = [{ email: 'guilherme@fazenda.com.br', nome: ' Guilherme ', papel: 'operador' }];

  it('usa o nome do cadastro em Pessoas com acesso (e-mail sem diferenciar maiúsculas)', () => {
    expect(nomeDaConta('Guilherme@Fazenda.com.br', 'Gui', membros)).toBe('Guilherme');
  });

  it('sem cadastro (ex.: administrador fixo), usa o nome da conta; sem nada, vazio', () => {
    expect(nomeDaConta('marialauragcardoso@gmail.com', 'Maria Laura', membros)).toBe('Maria Laura');
    expect(nomeDaConta('marialauragcardoso@gmail.com', null, membros)).toBe('');
    expect(nomeDaConta(null, null, null)).toBe('');
  });
});

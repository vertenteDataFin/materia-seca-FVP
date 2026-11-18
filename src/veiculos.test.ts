// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { definirRepositorio } from './dados';
import { RepositorioMemoria } from './repositorio';
import { importarVeiculosIniciais, VEICULOS_INICIAIS } from './veiculos';

let repo: RepositorioMemoria;

beforeEach(() => {
  repo = new RepositorioMemoria();
  repo.iniciar();
  definirRepositorio(repo);
});

describe('importarVeiculosIniciais', () => {
  it('banco vazio: entra a planilha toda, sem CPF', () => {
    expect(importarVeiculosIniciais()).toBe(VEICULOS_INICIAIS.length);
    const vs = repo.obter()!.veiculos;
    expect(vs.map((v) => v.placa).sort()).toEqual(['BXF7877', 'CHJ7E24', 'CPG0247', 'CRY4H95', 'IBY9G34', 'MUN2182']);
    expect(vs.every((v) => Object.keys(v).every((k) => !/cpf/i.test(k)))).toBe(true);
  });

  it('só entram os que faltam (pela placa); nº de cadastro já usado vai para o próximo livre', () => {
    repo.adicionar('veiculos', { numero: 1, motorista: 'Vitor Alonso', placa: 'CPG0247' });
    repo.adicionar('veiculos', { numero: 2, motorista: 'Fernando Alonso', placa: 'BXF-7877' });
    repo.adicionar('veiculos', { numero: 3, motorista: 'Joziclei Ancelmo', placa: 'IBY9G34' });
    repo.adicionar('veiculos', { numero: 4, motorista: 'Carlos Pereira', placa: 'RST4E56' }); // cadastrado à mão
    expect(importarVeiculosIniciais()).toBe(3);
    const porPlaca = new Map(repo.obter()!.veiculos.map((v) => [v.placa, v.numero]));
    expect(porPlaca.get('RST4E56')).toBe(4);
    expect(porPlaca.get('CRY4H95')).toBe(5); // o 4 da planilha já era do caminhão cadastrado à mão
    expect(porPlaca.get('CHJ7E24')).toBe(6);
    expect(porPlaca.get('MUN2182')).toBe(7);
    // rodar de novo não duplica
    expect(importarVeiculosIniciais()).toBe(0);
    expect(repo.obter()!.veiculos).toHaveLength(7);
  });
});

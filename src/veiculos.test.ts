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
    expect(vs.map((v) => v.placa).sort()).toEqual(['BXF7877', 'CKZ3D25', 'CPG0247', 'CRY4H95', 'CXJ7E24', 'GMS0C59', 'IBY9G34', 'IIX6E53', 'MUN2182']);
    expect(vs.every((v) => Object.keys(v).every((k) => !/cpf/i.test(k)))).toBe(true);
  });

  it('só entram os que faltam (pela placa); nº de cadastro já usado vai para o próximo livre', () => {
    repo.adicionar('veiculos', { numero: 1, motorista: 'Vitor Alonso', placa: 'CPG0247' });
    repo.adicionar('veiculos', { numero: 2, motorista: 'Fernando Alonso', placa: 'BXF-7877' });
    repo.adicionar('veiculos', { numero: 3, motorista: 'Joziclei Ancelmo', placa: 'IBY9G34' });
    repo.adicionar('veiculos', { numero: 4, motorista: 'Carlos Pereira', placa: 'RST4E56' }); // cadastrado à mão
    expect(importarVeiculosIniciais()).toBe(6);
    const porPlaca = new Map(repo.obter()!.veiculos.map((v) => [v.placa, v.numero]));
    expect(porPlaca.get('RST4E56')).toBe(4);
    // o 4 da planilha já era do caminhão cadastrado à mão: a partir dali cada um vai para o próximo livre
    expect(porPlaca.get('CRY4H95')).toBe(5);
    expect(porPlaca.get('CXJ7E24')).toBe(6);
    expect(porPlaca.get('MUN2182')).toBe(7);
    expect(porPlaca.get('IIX6E53')).toBe(8);
    expect(porPlaca.get('CKZ3D25')).toBe(9);
    expect(porPlaca.get('GMS0C59')).toBe(21);
    // rodar de novo não duplica
    expect(importarVeiculosIniciais()).toBe(0);
    expect(repo.obter()!.veiculos).toHaveLength(10);
  });

  it('cadastro de ontem (6 caminhões): corrige a placa do Sebastião e acrescenta os 3 novos, sem duplicar', () => {
    const ontem = [
      [1, 'Vitor Alonso', 'CPG0247'], [2, 'Fernando Alonso', 'BXF7877'], [3, 'Joziclei Ancelmo', 'IBY9G34'],
      [4, 'Claudinei Marques', 'CRY4H95'], [5, 'Sebastião David', 'CHJ7E24'], [6, 'Jonas Nogueira', 'MUN2182'],
    ] as const;
    for (const [numero, motorista, placa] of ontem) repo.adicionar('veiculos', { numero, motorista, placa });
    expect(importarVeiculosIniciais()).toBe(4); // 1 correção + 3 novos
    const vs = repo.obter()!.veiculos;
    expect(vs).toHaveLength(9);
    const sebastiao = vs.filter((v) => v.motorista === 'Sebastião David');
    expect(sebastiao.map((v) => [v.numero, v.placa])).toEqual([[5, 'CXJ7E24']]);
    expect(vs.find((v) => v.placa === 'IIX6E53')?.numero).toBe(7);
    expect(vs.find((v) => v.placa === 'GMS0C59')?.numero).toBe(21);
    expect(vs.find((v) => v.placa === 'CKZ3D25')?.numero).toBe(8);
    expect(importarVeiculosIniciais()).toBe(0);
  });

  it('lista de hoje cedo (8 caminhões): só entra o Paulo Cesar Meneses, com o nº 8', () => {
    for (const v of VEICULOS_INICIAIS.filter((x) => x.placa !== 'CKZ3D25')) repo.adicionar('veiculos', v);
    expect(importarVeiculosIniciais()).toBe(1);
    const paulo = repo.obter()!.veiculos.filter((v) => v.placa === 'CKZ3D25');
    expect(paulo.map((v) => [v.numero, v.motorista])).toEqual([[8, 'Paulo Cesar Meneses']]);
  });
});
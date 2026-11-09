// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { definirRepositorio } from './dados';
import { RepositorioMemoria } from './repositorio';
import { gravarLegado } from './legado';
import { CHAVE_MIGRADO, migrarLegadoUmaVez } from './migracaoLegado';

describe('migração do banco antigo', () => {
  let repo: RepositorioMemoria;
  beforeEach(() => {
    repo = new RepositorioMemoria();
    repo.iniciar();
    definirRepositorio(repo);
    localStorage.clear();
  });

  it('leva talhões, coletas e amostras, casando talhões já existentes pelo nome', async () => {
    const t18 = repo.adicionar('talhoes', { nome: 'Talhão 18 - PD', capim: 'Miyagi', areaHa: 118 });
    await gravarLegado({
      talhoes: [
        { id: 1, nome: 'PD - TALHAO 18', capim: 'Miyagi', areaHa: 118 },
        { id: 2, nome: 'Meu talhão', capim: 'Zuri', areaHa: 5 },
      ],
      coletas: [
        { id: 10, talhaoId: 1, data: '2026-11-07', responsavel: 'Luiz', areaAmostralM2: 1 },
        { id: 11, talhaoId: 2, data: '2026-11-08', responsavel: '', areaAmostralM2: 0.25 },
      ],
      amostras: [
        { id: 100, coletaId: 10, ponto: 1, pesoVerdeKg: 2, pesoUmidoG: 100, pesoSecoG: 22, lat: -19.1, lng: -52.2 },
        { id: 101, coletaId: 11, ponto: 1, pesoVerdeKg: 0.5, pesoUmidoG: null, pesoSecoG: null },
      ],
    });

    const r = await migrarLegadoUmaVez();
    expect(r).toEqual({ talhoesNovos: 1, talhoesReaproveitados: 1, coletasNovas: 2, coletasExistentes: 0, amostras: 2 });
    const d = repo.obter()!;
    expect(d.talhoes).toHaveLength(2);
    const c18 = d.coletas.find((c) => c.responsavel === 'Luiz')!;
    expect(c18.talhaoId).toBe(t18);
    expect(d.amostras.find((a) => a.coletaId === c18.id)).toMatchObject({ pesoVerdeKg: 2, lat: -19.1 });
    expect(localStorage.getItem(CHAVE_MIGRADO)).toBe('1');

    // segunda chamada não faz nada
    expect(await migrarLegadoUmaVez()).toBeNull();
    expect(repo.obter()!.coletas).toHaveLength(2);
  });
});

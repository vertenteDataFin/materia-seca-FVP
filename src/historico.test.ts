// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { descreverLote, opsDeRestauracao, type EntradaHistorico } from './historico';
import type { Dados } from './tipos';

const dados: Dados = {
  talhoes: [{ id: 't18', nome: 'Talhão 18 - PD', areaHa: 118, capim: 'Miyagi', geometria: [[[-52, -19], [-52.01, -19], [-52.01, -19.01]]] }],
  coletas: [{ id: 'c1', talhaoId: 't18', data: '2026-11-07', responsavel: '', areaAmostralM2: 1 }],
  amostras: [
    { id: 'a1', coletaId: 'c1', ponto: 1, pesoVerdeKg: 2.02, pesoUmidoG: 100, pesoSecoG: 22 },
    { id: 'a2', coletaId: 'c1', ponto: 2, pesoVerdeKg: 1, pesoUmidoG: 100, pesoSecoG: 26 },
  ],
};

describe('histórico de alterações', () => {
  it('descreve a exclusão de uma coleta e guarda tudo para desfazer', () => {
    const e = descreverLote(
      [
        { tipo: 'remover', colecao: 'amostras', id: 'a1' },
        { tipo: 'remover', colecao: 'amostras', id: 'a2' },
        { tipo: 'remover', colecao: 'coletas', id: 'c1' },
      ],
      dados,
    )!;
    expect(e.acao).toBe('excluiu');
    expect(e.descricao).toBe('coleta Talhão 18 - PD · 07/11/2026 (2 amostras)');
    const itens = JSON.parse(e.itensJson!);
    expect(itens.removidos.coletas).toHaveLength(1);
    expect(itens.removidos.amostras).toHaveLength(2);

    // depois da exclusão, a restauração reinsere coleta e amostras
    const depois: Dados = { ...dados, coletas: [], amostras: [] };
    const ops = opsDeRestauracao({ id: 'h', em: '', quem: '', ...e }, depois);
    expect(ops.map((o) => `${o.tipo}:${o.colecao}:${o.id}`)).toEqual(['adicionar:coletas:c1', 'adicionar:amostras:a1', 'adicionar:amostras:a2']);
    expect((ops[0] as { dados: Record<string, unknown> }).dados).toEqual({ talhaoId: 't18', data: '2026-11-07', responsavel: '', areaAmostralM2: 1 });
    // se já existir de novo, não duplica
    expect(opsDeRestauracao({ id: 'h', em: '', quem: '', ...e }, dados)).toEqual([]);
  });

  it('descreve edições com antes → depois e permite voltar aos valores anteriores', () => {
    const e = descreverLote([{ tipo: 'atualizar', colecao: 'amostras', id: 'a1', dados: { pesoVerdeKg: 2.5, pesoSecoG: 22 } }], dados)!;
    expect(e.acao).toBe('editou');
    expect(e.descricao).toBe('ponto 1 da coleta Talhão 18 - PD · 07/11/2026 — peso verde (kg): 2,02 → 2,5');
    const ops = opsDeRestauracao({ id: 'h', em: '', quem: '', ...e }, dados);
    expect(ops).toEqual([{ tipo: 'atualizar', colecao: 'amostras', id: 'a1', dados: { pesoVerdeKg: 2.02 } }]);
  });

  it('posição marcada no mapa vira uma só mudança; criação descreve o registro novo', () => {
    const pos = descreverLote([{ tipo: 'atualizar', colecao: 'amostras', id: 'a1', dados: { lat: -19.4, lng: -52.6, precisaoM: null, capturadoEm: 'x' } }], dados)!;
    expect(pos.descricao).toBe('ponto 1 da coleta Talhão 18 - PD · 07/11/2026 — posição');
    const nova = descreverLote([{ tipo: 'adicionar', colecao: 'coletas', id: 'c2', dados: { talhaoId: 't18', data: '2026-11-12', responsavel: '', areaAmostralM2: 1 } }], dados)!;
    expect(nova.acao).toBe('criou');
    expect(nova.descricao).toBe('coleta Talhão 18 - PD · 12/11/2026');
    expect(nova.itensJson).toBeUndefined();
    const varios = descreverLote(
      [
        { tipo: 'adicionar', colecao: 'talhoes', id: 'x', dados: { nome: 'Talhão 9', areaHa: 1, capim: '' } },
        { tipo: 'adicionar', colecao: 'talhoes', id: 'y', dados: { nome: 'Talhão 10', areaHa: 1, capim: '' } },
      ],
      dados,
    )!;
    expect(varios.descricao).toBe('2 talhões');
  });

  it('ignora lotes sem efeito, silenciosos e aceita rótulo de restauração', () => {
    expect(descreverLote([], dados)).toBeNull();
    expect(descreverLote([{ tipo: 'atualizar', colecao: 'amostras', id: 'a1', dados: { pesoSecoG: 22 } }], dados)).toBeNull();
    expect(descreverLote([{ tipo: 'remover', colecao: 'coletas', id: 'c1' }], dados, { silencioso: true })).toBeNull();
    const r = descreverLote([{ tipo: 'adicionar', colecao: 'coletas', id: 'c9', dados: { talhaoId: 't18', data: '2026-11-07', responsavel: '', areaAmostralM2: 1 } }], dados, {
      acao: 'restaurou',
      descricao: 'coleta Talhão 18 - PD · 07/11/2026 (2 amostras)',
    })!;
    expect(r).toEqual({ acao: 'restaurou', descricao: 'coleta Talhão 18 - PD · 07/11/2026 (2 amostras)', itensJson: undefined });
  });

  it('talhão excluído guarda o contorno quando cabe', () => {
    const e = descreverLote([{ tipo: 'remover', colecao: 'talhoes', id: 't18' }], dados)!;
    expect(e.descricao).toBe('talhão Talhão 18 - PD');
    const itens = JSON.parse(e.itensJson!);
    expect(itens.removidos.talhoes[0].geometria).toHaveLength(1);
    const entrada: EntradaHistorico = { id: 'h', em: '', quem: '', ...e };
    expect(opsDeRestauracao(entrada, { ...dados, talhoes: [] })).toHaveLength(1);
  });
});

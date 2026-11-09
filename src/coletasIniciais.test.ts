// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { importarColetasIniciais, OBS_COLETA_INICIAL } from './coletasIniciais';
import { resumoColeta } from './calc';

describe('importarColetasIniciais', () => {
  beforeEach(async () => {
    await Promise.all([db.talhoes.clear(), db.coletas.clear(), db.amostras.clear()]);
    await db.talhoes.bulkAdd([
      { nome: 'CONF - TALHAO 23', capim: 'Mombaça', areaHa: 49.9, observacoes: '' },
      { nome: 'CONF - TALHAO 21', capim: 'Mombaça', areaHa: 73, observacoes: '' },
      { nome: 'PD - TALHAO 18', capim: 'Miyagi', areaHa: 118, observacoes: '' },
    ]);
  });

  it('cria as 3 coletas com 10 amostras e reproduz o relatório', async () => {
    const r = await importarColetasIniciais();
    expect(r).toEqual({ criadas: 3, existentes: 0, semTalhao: [] });
    expect(await db.coletas.count()).toBe(3);
    expect(await db.amostras.count()).toBe(10);

    const t18 = (await db.talhoes.toArray()).find((t) => t.nome.includes('18'))!;
    const c18 = (await db.coletas.where('talhaoId').equals(t18.id!).toArray())[0];
    expect(c18.observacoes).toBe(OBS_COLETA_INICIAL);
    const am = await db.amostras.where('coletaId').equals(c18.id!).sortBy('ponto');
    expect(am.map((a) => a.ponto)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(am.every((a) => a.lat == null)).toBe(true);
    const r18 = resumoColeta(c18, am);
    expect(r18.nPontos).toBe(6);
    expect(r18.tMVha).toBeCloseTo(16.67, 1);
    expect(r18.cvPct).toBeCloseTo(33, 0);
    expect(r18.msPct).toBe(24);
    expect(r18.tMSha).toBeCloseTo(4.0, 1);
  });

  it('importa mesmo se o usuário já tiver outra coleta do talhão no mesmo dia', async () => {
    const t18 = (await db.talhoes.toArray()).find((t) => t.nome.includes('18'))!;
    await db.coletas.add({ talhaoId: t18.id!, data: '2026-11-07', responsavel: 'Teste', areaAmostralM2: 1, observacoes: 'teste do app' });
    const r = await importarColetasIniciais();
    expect(r).toEqual({ criadas: 3, existentes: 0, semTalhao: [] });
    const c18 = await db.coletas.where('talhaoId').equals(t18.id!).toArray();
    expect(c18).toHaveLength(2);
    expect(c18.filter((c) => c.observacoes === OBS_COLETA_INICIAL)).toHaveLength(1);
  });

  it('não duplica ao rodar de novo e avisa talhão ausente', async () => {
    await importarColetasIniciais();
    const r = await importarColetasIniciais();
    expect(r).toEqual({ criadas: 0, existentes: 3, semTalhao: [] });
    expect(await db.amostras.count()).toBe(10);

    await db.talhoes.where('nome').equals('PD - TALHAO 18').delete();
    await db.coletas.clear();
    await db.amostras.clear();
    expect(await importarColetasIniciais()).toEqual({ criadas: 2, existentes: 0, semTalhao: ['TL 18'] });
  });
});

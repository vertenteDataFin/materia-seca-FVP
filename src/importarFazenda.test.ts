// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { fundirDuplicados } from './importarFazenda';

describe('fundirDuplicados', () => {
  beforeEach(async () => {
    await Promise.all([db.talhoes.clear(), db.coletas.clear(), db.amostras.clear()]);
  });

  it('mantém o mais antigo, move coletas e preenche campos vazios', async () => {
    const a = await db.talhoes.add({ nome: 'CONF - TALHAO 20', capim: '', areaHa: 0, observacoes: '' });
    const b = await db.talhoes.add({ nome: 'CONF - TALHAO 20', capim: 'Piatã', areaHa: 35, fazenda: 'Confinamento', observacoes: '' });
    await db.talhoes.add({ nome: 'CONF - TALHAO 21', capim: 'Mombaça', areaHa: 73, observacoes: '' });
    const c = await db.coletas.add({ talhaoId: b, data: '2026-11-06', responsavel: '', areaAmostralM2: 1 });

    expect(await fundirDuplicados()).toBe(1);
    expect(await db.talhoes.count()).toBe(2);
    const mantido = await db.talhoes.get(a);
    expect(mantido).toMatchObject({ capim: 'Piatã', areaHa: 35, fazenda: 'Confinamento' });
    expect((await db.coletas.get(c))!.talhaoId).toBe(a);
  });
});

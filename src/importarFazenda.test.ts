// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, listarTalhoes } from './db';
import { fundirDuplicados, importarTalhoesFazenda } from './importarFazenda';
import { readFileSync } from 'node:fs';

describe('importarTalhoesFazenda', () => {
  beforeEach(async () => {
    await Promise.all([db.talhoes.clear(), db.coletas.clear(), db.amostras.clear()]);
    const kml = readFileSync('public/talhoes-fazenda.kml', 'utf8');
    vi.stubGlobal('fetch', async () => new Response(kml, { status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('cria os talhões com o nome padrão e renomeia os que ainda têm o nome do KML', async () => {
    const antigo = await db.talhoes.add({ nome: 'PD - TALHAO 18', capim: 'Miyagi', areaHa: 118, observacoes: '' });
    const curto = await db.talhoes.add({ nome: 'TL 21', capim: 'Mombaça', areaHa: 73, observacoes: '' });
    const custom = await db.talhoes.add({ nome: 'Talhão 23 compostagem', capim: 'Mombaça', areaHa: 49.9, observacoes: '' });
    await importarTalhoesFazenda();
    expect((await db.talhoes.get(antigo))!.nome).toBe('Talhão 18 - PD');
    expect((await db.talhoes.get(curto))!.nome).toBe('Talhão 21 - Conf');
    expect((await db.talhoes.get(custom))!.nome).toBe('Talhão 23 compostagem'); // personalizado: não mexe
    const nomes = (await listarTalhoes()).map((t) => t.nome);
    expect(nomes).toContain('Pivô 1 - Conf');
    expect(nomes).toContain('Talhão 17A - PD');
    expect(nomes).toContain('Talhão C3 - Conf');
    expect(nomes.indexOf('Talhão 13 - PD')).toBeLessThan(nomes.indexOf('Talhão 17A - PD'));
    expect(nomes.indexOf('Talhão 17E - PD')).toBeLessThan(nomes.indexOf('Talhão 18 - PD'));
  });
});

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

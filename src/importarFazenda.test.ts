// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirRepositorio } from './dados';
import { RepositorioMemoria } from './repositorio';
import { compararNomes } from './tipos';
import { fundirDuplicados, importarTalhoesFazenda } from './importarFazenda';

let repo: RepositorioMemoria;

beforeEach(() => {
  repo = new RepositorioMemoria();
  repo.iniciar();
  definirRepositorio(repo);
});

describe('importarTalhoesFazenda', () => {
  beforeEach(() => {
    const kml = readFileSync('public/talhoes-fazenda.kml', 'utf8');
    vi.stubGlobal('fetch', async () => new Response(kml, { status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('cria os talhões com o nome padrão e renomeia os que ainda têm o nome do KML', async () => {
    const antigo = repo.adicionar('talhoes', { nome: 'PD - TALHAO 18', capim: 'Miyagi', areaHa: 118, observacoes: '' });
    const curto = repo.adicionar('talhoes', { nome: 'TL 21', capim: 'Mombaça', areaHa: 73, observacoes: '' });
    const custom = repo.adicionar('talhoes', { nome: 'Talhão 23 compostagem', capim: 'Mombaça', areaHa: 49.9, observacoes: '' });
    // simula aparelho que já tinha o capim antigo derivado do KML
    const velho = repo.adicionar('talhoes', { nome: 'Talhão 20 - Conf', capim: 'Piatã/Compostagem', capimKml: 'Piatã/Compostagem', areaHa: 35 });
    const escolhido = repo.adicionar('talhoes', { nome: 'Talhão 19 - PD', capim: 'Zuri', capimKml: 'Miyagi', areaHa: 95 });
    const r = await importarTalhoesFazenda();
    expect(r.atualizados).toBe(4);
    const d = repo.obter()!;
    const nome = (id: string) => d.talhoes.find((t) => t.id === id)!.nome;
    expect(nome(antigo)).toBe('Talhão 18 - PD');
    expect(nome(curto)).toBe('Talhão 21 - Conf');
    expect(nome(custom)).toBe('Talhão 23 compostagem'); // personalizado: não mexe
    // capim derivado do KML acompanha o KML; capim escolhido pelo usuário fica
    const t23 = d.talhoes.find((t) => t.nome === 'Talhão 23 - Conf')!;
    expect(t23.capim).toBe('Mombaça');
    expect(t23.capimKml).toBe('Mombaça');
    const t18 = d.talhoes.find((t) => t.id === antigo)!;
    expect(t18.capim).toBe('Miyagi');
    expect(d.talhoes.find((t) => t.id === velho)!.capim).toBe('Piatã');
    expect(d.talhoes.find((t) => t.id === escolhido)!.capim).toBe('Zuri');
    expect(d.talhoes.find((t) => t.id === antigo)!.geometria!.length).toBeGreaterThan(0);
    const nomes = d.talhoes.map((t) => t.nome).sort(compararNomes);
    expect(nomes).toContain('Pivô 1 - Conf');
    expect(nomes).toContain('Talhão 17A - PD');
    expect(nomes).toContain('Talhão C3 - Conf');
    expect(nomes.indexOf('Talhão 13 - PD')).toBeLessThan(nomes.indexOf('Talhão 17A - PD'));
    expect(nomes.indexOf('Talhão 17E - PD')).toBeLessThan(nomes.indexOf('Talhão 18 - PD'));
    // rodar de novo não cria nada
    expect(await importarTalhoesFazenda()).toEqual({ criados: 0, atualizados: 14 });
    expect(repo.obter()!.talhoes).toHaveLength(d.talhoes.length);
  });
});

describe('fundirDuplicados', () => {
  it('mantém o primeiro, move coletas e preenche campos vazios', () => {
    const a = repo.adicionar('talhoes', { nome: 'CONF - TALHAO 20', capim: '', areaHa: 0, observacoes: '' }, 'a');
    const b = repo.adicionar('talhoes', { nome: 'CONF - TALHAO 20', capim: 'Piatã', areaHa: 35, fazenda: 'Confinamento', observacoes: '' }, 'b');
    repo.adicionar('talhoes', { nome: 'CONF - TALHAO 21', capim: 'Mombaça', areaHa: 73, observacoes: '' });
    const c = repo.adicionar('coletas', { talhaoId: b, data: '2026-11-06', responsavel: '', areaAmostralM2: 1 });

    expect(fundirDuplicados()).toBe(1);
    const d = repo.obter()!;
    expect(d.talhoes).toHaveLength(2);
    expect(d.talhoes.find((t) => t.id === a)).toMatchObject({ capim: 'Piatã', areaHa: 35, fazenda: 'Confinamento' });
    expect(d.coletas.find((x) => x.id === c)!.talhaoId).toBe(a);
  });
});

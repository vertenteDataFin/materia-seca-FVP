// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirRepositorio, excluirTalhao } from './dados';
import { RepositorioMemoria } from './repositorio';
import { compararNomes } from './tipos';
import { fundirDuplicados, importarTalhoesFazenda } from './importarFazenda';
import { chaveTalhao } from './talhoesExcluidos';

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
    const escolhido = repo.adicionar('talhoes', { nome: 'Talhão 17E - PD', capim: 'Zuri', capimKml: 'Mombaça', areaHa: 105 });
    // talhão do KML anterior que foi dividido entre capins: fica com a parte do mesmo capim e ganha o capim no nome
    const dividido = repo.adicionar('talhoes', { nome: 'Talhão 17A - PD', capim: 'Mombaça', capimKml: 'Mombaça', areaHa: 73.3, areaKmlHa: 73.3 });
    // saiu do mapa: removido se não tem coletas, mantido se tem
    const sumiu = repo.adicionar('talhoes', { nome: 'Talhão 19 - PD', capim: 'Miyagi', capimKml: 'Miyagi', areaHa: 95, areaKmlHa: 95 });
    const comColeta = repo.adicionar('talhoes', { nome: 'Talhão 13 - PD', capim: 'Miyagi', capimKml: 'Miyagi', areaHa: 63, areaKmlHa: 63 });
    repo.adicionar('coletas', { talhaoId: comColeta, data: '2026-11-06', responsavel: '', areaAmostralM2: 1 });
    const r = await importarTalhoesFazenda();
    expect(r).toEqual({ criados: 14, atualizados: 5, removidos: 1 });
    const d = repo.obter()!;
    const nome = (id: string) => d.talhoes.find((t) => t.id === id)!.nome;
    expect(nome(antigo)).toBe('Talhão 18A - PD'); // talhão 18 dividido: o antigo vira o 18A
    expect(nome(curto)).toBe('Talhão 21 - Conf');
    expect(nome(custom)).toBe('Talhão 23 compostagem'); // personalizado: não mexe
    expect(nome(comColeta)).toBe('Talhão 13 - PD');
    expect(d.talhoes.find((t) => t.id === sumiu)).toBeUndefined();
    const t17a = d.talhoes.find((t) => t.id === dividido)!;
    expect(t17a.nome).toBe('Talhão 17A Mombaça - PD');
    expect(t17a.capim).toBe('Mombaça');
    expect(t17a.areaHa).toBeCloseTo(28.4, 0); // área em uso era a do KML: acompanha a nova parte
    expect(t17a.geometria).toHaveLength(1);
    // 18A: parte de cima (4 anéis) com a área da parte; 18B criado com a parte de baixo
    expect(d.talhoes.find((t) => t.id === antigo)!.geometria).toHaveLength(4);
    expect(d.talhoes.find((t) => t.id === antigo)!.areaKmlHa).toBe(70.6);
    expect(d.talhoes.find((t) => t.id === antigo)!.areaHa).toBe(70.6);
    expect(d.talhoes.find((t) => t.nome === 'Talhão 18B - PD')!.areaHa).toBe(37.2);
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
    expect(nomes).toContain('Talhão 13A - PD');
    expect(nomes).toContain('Talhão 13B - PD');
    expect(nomes).toContain('Talhão 17A Miyagi - PD');
    expect(nomes).toContain('Talhão 17B Miyagi - PD');
    expect(nomes).toContain('Talhão 17B Mombaça - PD');
    expect(nomes).toContain('Talhão C3 - Conf');
    expect(nomes).not.toContain('Talhão 19 - PD');
    expect(nomes.indexOf('Talhão 13A - PD')).toBeLessThan(nomes.indexOf('Talhão 17A Miyagi - PD'));
    expect(nomes.indexOf('Talhão 17E - PD')).toBeLessThan(nomes.indexOf('Talhão 18A - PD'));
    // sem atividade no KML, mas incluídos a pedido: entram sem capim, com contorno, fazenda e área
    const cau1 = d.talhoes.find((t) => t.nome === 'Talhão 1 - CAU')!;
    expect(cau1).toMatchObject({ capim: '', capimKml: '', fazenda: 'Caua' });
    expect(cau1.geometria).toHaveLength(2);
    expect(cau1.areaHa).toBeGreaterThan(0);
    const cau2a = d.talhoes.find((t) => t.nome === 'Talhão 2A - CAU')!;
    expect(cau2a).toMatchObject({ capim: '', fazenda: 'Caua' });
    expect(cau2a.geometria).toHaveLength(1);
    // contorno redesenhado (102,8 ha) difere muito dos 70 ha da descrição: vale o contorno
    expect(cau2a.areaHa).toBeCloseTo(102.8, 1);
    expect(nomes).not.toContain('Talhão 2 - CAU'); // os demais "sem atividade" continuam de fora
    expect(d.talhoes).toHaveLength(21); // 19 do KML + personalizado + TL 13 com coleta
    // rodar de novo não cria nem remove nada
    expect(await importarTalhoesFazenda()).toEqual({ criados: 0, atualizados: 19, removidos: 0 });
    expect(repo.obter()!.talhoes).toHaveLength(d.talhoes.length);
  });

  it('talhão 18 dividido: coletas com GPS na parte de baixo vão para o 18B; sem GPS ficam no 18A', async () => {
    const t18 = repo.adicionar('talhoes', { nome: 'Talhão 18 - PD', capim: 'Miyagi', capimKml: 'Miyagi', areaHa: 118, areaKmlHa: 118, fazenda: 'Pedra' });
    const ponto = (coletaId: string, ponto: number, lng: number, lat: number) =>
      repo.adicionar('amostras', { coletaId, ponto, pesoVerdeKg: 2, pesoUmidoG: null, pesoSecoG: null, lat, lng });
    const deBaixo = repo.adicionar('coletas', { talhaoId: t18, data: '2026-11-10', responsavel: '', areaAmostralM2: 1 });
    ponto(deBaixo, 1, -52.592, -19.434);
    ponto(deBaixo, 2, -52.5915, -19.4345);
    const deCima = repo.adicionar('coletas', { talhaoId: t18, data: '2026-11-10', responsavel: '', areaAmostralM2: 1 });
    ponto(deCima, 1, -52.592, -19.428);
    const semGps = repo.adicionar('coletas', { talhaoId: t18, data: '2026-11-07', responsavel: '', areaAmostralM2: 1 });
    repo.adicionar('amostras', { coletaId: semGps, ponto: 1, pesoVerdeKg: 2, pesoUmidoG: null, pesoSecoG: null });
    await importarTalhoesFazenda();
    const d = repo.obter()!;
    const t18b = d.talhoes.find((t) => t.nome === 'Talhão 18B - PD')!;
    expect(d.talhoes.find((t) => t.id === t18)!.nome).toBe('Talhão 18A - PD');
    expect(d.coletas.find((c) => c.id === deBaixo)!.talhaoId).toBe(t18b.id);
    expect(d.coletas.find((c) => c.id === deCima)!.talhaoId).toBe(t18);
    expect(d.coletas.find((c) => c.id === semGps)!.talhaoId).toBe(t18);
    // não divide de novo
    await importarTalhoesFazenda();
    expect(repo.obter()!.talhoes.filter((t) => /^Talhão 18/.test(t.nome)).map((t) => t.nome).sort()).toEqual(['Talhão 18A - PD', 'Talhão 18B - PD']);
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

describe('talhão do mapa excluído no app', () => {
  beforeEach(() => {
    localStorage.clear();
    const kml = readFileSync('public/talhoes-fazenda.kml', 'utf8');
    vi.stubGlobal('fetch', async () => new Response(kml, { status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('não volta na próxima sincronização (outro aparelho/usuário); se for restaurado, fica', async () => {
    await importarTalhoesFazenda();
    const cau1 = () => repo.obter()!.talhoes.filter((t) => /^Talhão 1 - CAU$/.test(t.nome));
    expect(cau1()).toHaveLength(1);
    const total = repo.obter()!.talhoes.length;

    excluirTalhao(cau1()[0].id);
    expect(cau1()).toHaveLength(0);
    const r = await importarTalhoesFazenda();
    expect(r.criados).toBe(0);
    expect(cau1()).toHaveLength(0);
    expect(repo.obter()!.talhoes.length).toBe(total - 1);

    // restaurado pelo histórico (mesmo nome): a sincronização casa com ele e não o remove
    repo.adicionar('talhoes', { nome: 'Talhão 1 - CAU', capim: 'Mombaça', areaHa: 10, observacoes: '' });
    await importarTalhoesFazenda();
    expect(cau1()).toHaveLength(1);
  });

  it('a chave casa o nome do app com o do KML', () => {
    expect(chaveTalhao('Talhão 1 - CAU', 'Cauã')).toBe(chaveTalhao('CAU - TALHAO 1', 'Cauã'));
    expect(chaveTalhao('Talhão 1 - CAU', 'Cauã')).not.toBe(chaveTalhao('Talhão 1 - PD', 'Pedra'));
  });
});

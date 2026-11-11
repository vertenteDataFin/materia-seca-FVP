// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { definirRepositorio } from './dados';
import { RepositorioMemoria } from './repositorio';
import { importarColetasIniciais, OBS_COLETA_INICIAL } from './coletasIniciais';
import { resumoColeta } from './calc';
import { removerPonto } from './coletas';

let repo: RepositorioMemoria;

describe('importarColetasIniciais', () => {
  beforeEach(() => {
    repo = new RepositorioMemoria();
    repo.iniciar();
    definirRepositorio(repo);
    repo.adicionar('talhoes', { nome: 'Talhão 23 - Conf', capim: 'Mombaça', areaHa: 49.9, observacoes: '' });
    repo.adicionar('talhoes', { nome: 'Talhão 21 - Conf', capim: 'Mombaça', areaHa: 73, observacoes: '' });
    repo.adicionar('talhoes', { nome: 'Talhão 18 - PD', capim: 'Miyagi', areaHa: 118, observacoes: '' });
  });

  it('cria as 3 coletas com 10 amostras e reproduz a ficha', () => {
    const r = importarColetasIniciais();
    expect(r).toEqual({ criadas: 3, existentes: 0, completadas: 0, repostas: 0, semTalhao: [] });
    const d = repo.obter()!;
    expect(d.coletas).toHaveLength(3);
    expect(d.amostras).toHaveLength(10);

    const t18 = d.talhoes.find((t) => t.nome.includes('18'))!;
    const c18 = d.coletas.find((c) => c.talhaoId === t18.id)!;
    expect(c18.observacoes).toBe(OBS_COLETA_INICIAL);
    const am = d.amostras.filter((a) => a.coletaId === c18.id).sort((a, b) => a.ponto - b.ponto);
    expect(am.map((a) => a.ponto)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(am.map((a) => a.pesoSecoG)).toEqual([22, 26, 24, 26, 22, 22]);
    expect(am.every((a) => a.lat == null)).toBe(true);
    const r18 = resumoColeta(c18, am);
    expect(r18.nPontos).toBe(6);
    expect(r18.nPontosMS).toBe(6);
    expect(r18.tMVha).toBeCloseTo(16.67, 1);
    expect(r18.cvPct).toBeCloseTo(33, 0);
    expect(r18.msPct).toBeCloseTo(23.67, 1);
    expect(r18.tMSha).toBeCloseTo(3.94, 1);
  });

  it('completa úmido/seco das amostras já lançadas que estavam em branco, sem mexer nas preenchidas', () => {
    importarColetasIniciais();
    const d = repo.obter()!;
    const t18 = d.talhoes.find((t) => t.nome.includes('18'))!;
    const c18 = d.coletas.find((c) => c.talhaoId === t18.id)!;
    const am = d.amostras.filter((a) => a.coletaId === c18.id).sort((a, b) => a.ponto - b.ponto);
    // simula o estado antigo: pontos 3 a 6 sem MS; ponto 2 com valor digitado pelo usuário
    for (const a of am.slice(2)) repo.atualizar('amostras', a.id, { pesoUmidoG: null, pesoSecoG: null });
    repo.atualizar('amostras', am[1].id, { pesoUmidoG: 120, pesoSecoG: 30 });

    const r = importarColetasIniciais();
    expect(r).toEqual({ criadas: 0, existentes: 3, completadas: 4, repostas: 0, semTalhao: [] });
    const depois = repo.obter()!.amostras.filter((a) => a.coletaId === c18.id).sort((a, b) => a.ponto - b.ponto);
    expect(depois.map((a) => a.pesoSecoG)).toEqual([22, 30, 24, 26, 22, 22]);
    expect(depois.map((a) => a.pesoUmidoG)).toEqual([100, 120, 100, 100, 100, 100]);
    // de novo: nada a completar
    expect(importarColetasIniciais().completadas).toBe(0);
  });

  it('importa mesmo se o usuário já tiver outra coleta do talhão no mesmo dia', () => {
    const t18 = repo.obter()!.talhoes.find((t) => t.nome.includes('18'))!;
    repo.adicionar('coletas', { talhaoId: t18.id, data: '2026-11-07', responsavel: 'Teste', areaAmostralM2: 1, observacoes: 'teste do app' });
    expect(importarColetasIniciais()).toEqual({ criadas: 3, existentes: 0, completadas: 0, repostas: 0, semTalhao: [] });
    const c18 = repo.obter()!.coletas.filter((c) => c.talhaoId === t18.id);
    expect(c18).toHaveLength(2);
    expect(c18.filter((c) => c.observacoes === OBS_COLETA_INICIAL)).toHaveLength(1);
  });

  it('não duplica ao rodar de novo e avisa talhão ausente', () => {
    importarColetasIniciais();
    expect(importarColetasIniciais()).toEqual({ criadas: 0, existentes: 3, completadas: 0, repostas: 0, semTalhao: [] });
    expect(repo.obter()!.amostras).toHaveLength(10);

    const t18 = repo.obter()!.talhoes.find((t) => t.nome.includes('18'))!;
    repo.remover('talhoes', t18.id);
    for (const c of repo.obter()!.coletas) repo.remover('coletas', c.id);
    expect(importarColetasIniciais()).toEqual({ criadas: 2, existentes: 0, completadas: 0, repostas: 0, semTalhao: ['TL 18'] });
  });

  it('repõe um ponto da ficha excluído por engano, na numeração original', () => {
    importarColetasIniciais();
    const t18 = repo.obter()!.talhoes.find((t) => t.nome.includes('18'))!;
    const c18 = repo.obter()!.coletas.find((c) => c.talhaoId === t18.id)!;
    const am = () => repo.obter()!.amostras.filter((a) => a.coletaId === c18.id).sort((a, b) => a.ponto - b.ponto);
    // o usuário excluiu o ponto 1 (2,02 kg / 22 g) e os outros foram renumerados 1..5
    removerPonto(am()[0].id);
    expect(am().map((a) => a.pesoVerdeKg)).toEqual([1.0, 2.3, 1.0, 2.0, 1.68]);
    // marca posição no ponto que hoje é o 2 (2,3 kg) para conferir que acompanha a renumeração
    repo.atualizar('amostras', am()[1].id, { lat: -19.4, lng: -52.6 });

    expect(importarColetasIniciais()).toEqual({ criadas: 0, existentes: 3, completadas: 0, repostas: 1, semTalhao: [] });
    const depois = am();
    expect(depois.map((a) => [a.ponto, a.pesoVerdeKg, a.pesoSecoG])).toEqual([[1, 2.02, 22], [2, 1.0, 26], [3, 2.3, 24], [4, 1.0, 26], [5, 2.0, 22], [6, 1.68, 22]]);
    expect(depois[2].lat).toBe(-19.4); // o ponto de 2,3 kg voltou a ser o 3, com a posição
    expect(importarColetasIniciais().repostas).toBe(0);
  });

  it('não repõe nada quando a quantidade bate, mesmo com valor corrigido à mão', () => {
    importarColetasIniciais();
    const a = repo.obter()!.amostras.find((x) => x.pesoVerdeKg === 2.02)!;
    repo.atualizar('amostras', a.id, { pesoVerdeKg: 2.1 });
    expect(importarColetasIniciais()).toEqual({ criadas: 0, existentes: 3, completadas: 0, repostas: 0, semTalhao: [] });
    expect(repo.obter()!.amostras).toHaveLength(10);
  });
});

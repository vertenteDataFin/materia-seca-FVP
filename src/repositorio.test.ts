// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositorioLocal, RepositorioMemoria } from './repositorio';
import { definirRepositorio, excluirTalhao, restaurarBackup } from './dados';
import { adicionarPonto, criarColeta, removerPonto } from './coletas';

describe('RepositorioMemoria', () => {
  it('notifica assinantes e mantém referência estável sem mudanças', () => {
    const r = new RepositorioMemoria();
    r.iniciar();
    let n = 0;
    r.assinar(() => n++);
    const antes = r.obter();
    const id = r.adicionar('talhoes', { nome: 'X', capim: '', areaHa: 1 });
    expect(n).toBe(1);
    expect(r.obter()).not.toBe(antes);
    expect(r.obter()!.talhoes[0]).toMatchObject({ id, nome: 'X' });
    r.atualizar('talhoes', id, { capim: 'Miyagi', fazenda: undefined });
    expect(r.obter()!.talhoes[0].capim).toBe('Miyagi');
    expect('fazenda' in r.obter()!.talhoes[0]).toBe(false);
    r.remover('talhoes', id);
    expect(r.obter()!.talhoes).toHaveLength(0);
  });
});

describe('operações de domínio', () => {
  let repo: RepositorioMemoria;
  beforeEach(() => {
    repo = new RepositorioMemoria();
    repo.iniciar();
    definirRepositorio(repo);
    localStorage.clear();
  });

  it('cria coleta sempre com quadro de 1 m², numera e renumera pontos', () => {
    localStorage.setItem('silagem-ms:ultimo-quadro', '0,25'); // valor antigo do aparelho é ignorado
    const t = repo.adicionar('talhoes', { nome: 'T', capim: '', areaHa: 1 });
    const c = criarColeta(t, { areaAmostralM2: 0.5 });
    expect(repo.obter()!.coletas[0]).toMatchObject({ talhaoId: t, areaAmostralM2: 1 });
    const p1 = adicionarPonto(c);
    const p2 = adicionarPonto(c, { lat: -19, lng: -52 });
    adicionarPonto(c);
    expect(repo.obter()!.amostras.map((a) => a.ponto)).toEqual([1, 2, 3]);
    removerPonto(p1);
    const restantes = repo.obter()!.amostras.sort((a, b) => a.ponto - b.ponto);
    expect(restantes.map((a) => a.ponto)).toEqual([1, 2]);
    expect(restantes[0].id).toBe(p2);
  });

  it('excluir talhão leva coletas e amostras junto', () => {
    const t = repo.adicionar('talhoes', { nome: 'T', capim: '', areaHa: 1 });
    const t2 = repo.adicionar('talhoes', { nome: 'T2', capim: '', areaHa: 1 });
    const c = criarColeta(t);
    adicionarPonto(c);
    const c2 = criarColeta(t2);
    adicionarPonto(c2);
    excluirTalhao(t);
    const d = repo.obter()!;
    expect(d.talhoes.map((x) => x.id)).toEqual([t2]);
    expect(d.coletas.map((x) => x.id)).toEqual([c2]);
    expect(d.amostras.every((a) => a.coletaId === c2)).toBe(true);
  });

  it('restaura backup da versão 1 (ids numéricos) mantendo os vínculos', () => {
    repo.adicionar('talhoes', { nome: 'apagar', capim: '', areaHa: 1 });
    restaurarBackup({
      app: 'silagem-ms',
      versao: 1,
      exportadoEm: '',
      talhoes: [{ id: 7, nome: 'Talhão 18 - PD', capim: 'Miyagi', areaHa: 118 }],
      coletas: [{ id: 3, talhaoId: 7, data: '2026-11-07', responsavel: '', areaAmostralM2: 1 }],
      amostras: [{ id: 9, coletaId: 3, ponto: 1, pesoVerdeKg: 2, pesoUmidoG: null, pesoSecoG: null }],
    });
    const d = repo.obter()!;
    expect(d.talhoes).toHaveLength(1);
    expect(d.coletas[0].talhaoId).toBe(d.talhoes[0].id);
    expect(d.amostras[0].coletaId).toBe(d.coletas[0].id);
    expect(typeof d.amostras[0].id).toBe('string');
  });
});

describe('RepositorioLocal', () => {
  it('persiste no IndexedDB e recarrega', async () => {
    const a = new RepositorioLocal();
    a.iniciar();
    await a.aguardarPronto();
    const id = a.adicionar('talhoes', { nome: 'Persistido', capim: '', areaHa: 2 });
    await a.aguardarGravacao();

    const b = new RepositorioLocal();
    b.iniciar();
    await b.aguardarPronto();
    expect(b.obter()!.talhoes).toEqual([{ id, nome: 'Persistido', capim: '', areaHa: 2 }]);
  });
});

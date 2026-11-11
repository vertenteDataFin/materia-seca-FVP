// Testes contra o emulador do Firestore (npm run emuladores). Pulados se o emulador não estiver no ar.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { RepositorioFirestore } from './repositorioFirestore';

const HOST = '127.0.0.1';
const PORTA = 8080;
const FID = 'vertente';
const ADMIN = 'marialauragcardoso@gmail.com';

async function emuladorNoAr() {
  try {
    const r = await fetch(`http://${HOST}:${PORTA}/`);
    return r.ok;
  } catch {
    return false;
  }
}

const ativo = await emuladorNoAr();

describe.skipIf(!ativo)('regras do Firestore', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-silagem',
      firestore: { host: HOST, port: PORTA, rules: readFileSync('firestore.rules', 'utf8') },
    });
  });
  afterAll(() => env.cleanup());
  beforeEach(() => env.clearFirestore());

  const google = (email: string) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
  const senha = (email: string, verificado: boolean) => ({ email, email_verified: verificado, firebase: { sign_in_provider: 'password' } });
  const talhao = (db: Firestore) => doc(collection(db, 'fazendas', FID, 'talhoes'), 't1');
  const membro = (db: Firestore, email: string) => doc(collection(db, 'fazendas', FID, 'membros'), email);

  it('anônimo e e-mail não autorizado não leem nem gravam', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(talhao(anon)));
    const estranho = env.authenticatedContext('x', google('alguem@gmail.com')).firestore();
    await assertFails(getDocs(collection(estranho, 'fazendas', FID, 'talhoes')));
    await assertFails(setDoc(talhao(estranho), { nome: 'X' }));
  });

  it('admin fixo lê, grava e inclui membros; membro incluído passa a ter acesso', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(talhao(admin), { nome: 'Talhão 18 - PD', areaHa: 118, capim: 'Miyagi' }));
    await assertSucceeds(getDoc(talhao(admin)));

    const novo = env.authenticatedContext('b', google('joao@gmail.com')).firestore();
    await assertFails(getDoc(talhao(novo)));
    await assertSucceeds(setDoc(membro(admin, 'joao@gmail.com'), { nome: 'João', papel: 'membro' }));
    await assertSucceeds(getDoc(talhao(novo)));
    await assertSucceeds(setDoc(talhao(novo), { nome: 'editado' }, { merge: true }));
    // membro comum não inclui gente nem remove
    await assertFails(setDoc(membro(novo, 'outro@gmail.com'), { nome: 'Outro', papel: 'membro' }));
  });

  it('e-mail em maiúsculas é normalizado e conta com senha entra sem confirmar e-mail', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(admin, 'maria@fazenda.com.br'), { nome: 'Maria', papel: 'membro' }));
    await assertFails(setDoc(membro(admin, 'Fulano@Fazenda.com.br'), { nome: 'F', papel: 'membro' })); // id tem de ser minúsculo
    const mariaMaiusc = env.authenticatedContext('m', google('Maria@Fazenda.com.br')).firestore();
    await assertSucceeds(getDoc(talhao(mariaMaiusc)));
    const naoVerificada = env.authenticatedContext('n', senha('maria@fazenda.com.br', false)).firestore();
    await assertSucceeds(getDoc(talhao(naoVerificada)));
    const semEmail = env.authenticatedContext('s', {}).firestore();
    await assertFails(getDoc(talhao(semEmail)));
  });

  it('operador lê e registra, mas não exclui nem mexe em talhões', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(talhao(admin), { nome: 'Talhão 18 - PD', areaHa: 118, capim: 'Miyagi' }));
    await assertSucceeds(setDoc(membro(admin, 'campo@fazenda.com.br'), { nome: 'Campo', papel: 'operador' }));
    const op = env.authenticatedContext('o', senha('campo@fazenda.com.br', false)).firestore();
    const { deleteDoc, updateDoc } = await import('firebase/firestore');
    await assertSucceeds(getDoc(talhao(op)));
    await assertFails(updateDoc(talhao(op), { capim: 'Mombaça' }));
    await assertFails(deleteDoc(talhao(op)));
    const coleta = doc(collection(op, 'fazendas', FID, 'coletas'), 'c1');
    const amostra = doc(collection(op, 'fazendas', FID, 'amostras'), 'a1');
    await assertSucceeds(setDoc(coleta, { talhaoId: 't1', data: '2026-11-09', responsavel: '', areaAmostralM2: 1 }));
    await assertSucceeds(setDoc(amostra, { coletaId: 'c1', ponto: 1, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null }));
    await assertSucceeds(updateDoc(amostra, { pesoVerdeKg: 2.5 }));
    await assertFails(deleteDoc(amostra));
    await assertFails(deleteDoc(coleta));
    // membro comum exclui
    await assertSucceeds(setDoc(membro(admin, 'tec@fazenda.com.br'), { nome: 'Téc', papel: 'membro' }));
    const tec = env.authenticatedContext('t', senha('tec@fazenda.com.br', false)).firestore();
    await assertSucceeds(deleteDoc(doc(collection(tec, 'fazendas', FID, 'amostras'), 'a1')));
  });

  it('conta nova registra só o próprio pedido de acesso; admin lê e apaga', async () => {
    const novo = env.authenticatedContext('n', senha('novo@gmail.com', false)).firestore();
    const pedido = (db: Firestore, e: string) => doc(collection(db, 'fazendas', FID, 'solicitacoes'), e);
    await assertSucceeds(setDoc(pedido(novo, 'novo@gmail.com'), { email: 'novo@gmail.com', nome: 'Novo', em: '2026-11-09T12:00:00Z' }));
    // reenvio do próprio pedido (tela "Aguardando liberação" reenvia a cada abertura)
    await assertSucceeds(setDoc(pedido(novo, 'novo@gmail.com'), { email: 'novo@gmail.com', nome: 'Novo', em: '2026-11-10T12:00:00Z' }));
    await assertFails(setDoc(pedido(novo, 'outro@gmail.com'), { email: 'outro@gmail.com', nome: 'X', em: '2026-11-09T12:00:00Z' }));
    await assertFails(getDocs(collection(novo, 'fazendas', FID, 'solicitacoes')));
    await assertFails(getDoc(talhao(novo))); // ainda sem acesso aos dados
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(getDocs(collection(admin, 'fazendas', FID, 'solicitacoes')));
    await assertSucceeds(setDoc(membro(admin, 'novo@gmail.com'), { nome: 'Novo', papel: 'operador' }));
    const { deleteDoc } = await import('firebase/firestore');
    await assertSucceeds(deleteDoc(pedido(admin, 'novo@gmail.com')));
    await assertSucceeds(getDoc(talhao(novo))); // liberado
  });

  it('admin não remove a si mesmo da lista', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(admin, ADMIN), { nome: 'Eu', papel: 'admin' }));
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(membro(admin, ADMIN)));
  });
});

describe.skipIf(!ativo)('RepositorioFirestore', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-silagem',
      firestore: { host: HOST, port: PORTA, rules: readFileSync('firestore.rules', 'utf8') },
    });
  });
  afterAll(() => env.cleanup());
  beforeEach(() => env.clearFirestore());

  it('grava, lê de volta com contorno e sincroniza entre duas instâncias', async () => {
    const ctx = env.authenticatedContext('a', { email: ADMIN, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const a = new RepositorioFirestore(ctx.firestore() as unknown as Firestore, FID);
    const b = new RepositorioFirestore(ctx.firestore() as unknown as Firestore, FID);
    a.iniciar();
    b.iniciar();
    await Promise.all([a.aguardarPronto(), b.aguardarPronto()]);
    expect(a.obter()).toEqual({ talhoes: [], coletas: [], amostras: [] });

    const geometria: [number, number][][] = [[[-52, -19], [-51.99, -19], [-51.99, -19.01]]];
    const id = a.adicionar('talhoes', { nome: 'Talhão 18 - PD', capim: 'Miyagi', areaHa: 118, geometria, fazenda: undefined });
    expect(a.obter()!.talhoes[0].id).toBe(id); // na hora, antes do servidor
    const cId = a.adicionar('coletas', { talhaoId: id, data: '2026-11-07', responsavel: '', areaAmostralM2: 1 });
    a.lote([
      { tipo: 'adicionar', colecao: 'amostras', id: a.novoId(), dados: { coletaId: cId, ponto: 1, pesoVerdeKg: 2, pesoUmidoG: null, pesoSecoG: null } },
      { tipo: 'atualizar', colecao: 'talhoes', id, dados: { capim: 'Mombaça' } },
    ]);

    await esperar(() => b.obter()?.amostras.length === 1 && b.obter()?.talhoes[0]?.capim === 'Mombaça');
    const t = b.obter()!.talhoes[0];
    expect(t.geometria).toEqual(geometria);
    expect('geometriaJson' in t).toBe(false);
    expect('fazenda' in t).toBe(false);

    b.remover('amostras', b.obter()!.amostras[0].id);
    await esperar(() => a.obter()?.amostras.length === 0);
    a.parar();
    b.parar();
  });
});

async function esperar(cond: () => boolean, ms = 5000) {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('tempo esgotado esperando sincronização');
    await new Promise((r) => setTimeout(r, 50));
  }
}

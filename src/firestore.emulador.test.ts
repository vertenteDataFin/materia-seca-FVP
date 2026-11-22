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
// Projeto separado do usado pelo app em npm run dev:emulador (demo-silagem): os testes apagam o banco a cada caso.
const PROJETO_TESTES = 'demo-silagem-testes';

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
      projectId: PROJETO_TESTES,
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
    await assertFails(deleteDoc(amostra)); // ponto já pesado: operador não exclui
    await assertFails(deleteDoc(coleta));
    // ponto ainda sem peso de MV (marcado por engano no campo): operador exclui
    const semPeso = doc(collection(op, 'fazendas', FID, 'amostras'), 'a2');
    await assertSucceeds(setDoc(semPeso, { coletaId: 'c1', ponto: 2, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null }));
    await assertSucceeds(deleteDoc(semPeso));
    const semCampo = doc(collection(op, 'fazendas', FID, 'amostras'), 'a3');
    await assertSucceeds(setDoc(semCampo, { coletaId: 'c1', ponto: 3 }));
    await assertSucceeds(deleteDoc(semCampo));
    // amostra de colheita continua só para administrador e membro
    const ac = doc(collection(op, 'fazendas', FID, 'amostrasColheita'), 'x1');
    await assertSucceeds(setDoc(ac, { talhaoId: 't1', coletadaEm: '2026-11-17T08:00' }));
    await assertFails(deleteDoc(ac));
    // membro comum exclui
    await assertSucceeds(setDoc(membro(admin, 'tec@fazenda.com.br'), { nome: 'Téc', papel: 'membro' }));
    const tec = env.authenticatedContext('t', senha('tec@fazenda.com.br', false)).firestore();
    await assertSucceeds(deleteDoc(doc(collection(tec, 'fazendas', FID, 'amostras'), 'a1')));
  });

  it('cargas: todos registram a saída; só balanceiro e admin lançam peso; balanceiro não exclui', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(talhao(admin), { nome: 'Talhão 18 - PD', areaHa: 118, capim: 'Miyagi' }));
    await assertSucceeds(setDoc(membro(admin, 'campo@fazenda.com.br'), { nome: 'Campo', papel: 'operador' }));
    await assertSucceeds(setDoc(membro(admin, 'balanca@fazenda.com.br'), { nome: 'Balança', papel: 'balanceiro' }));
    await assertSucceeds(setDoc(membro(admin, 'tec@fazenda.com.br'), { nome: 'Téc', papel: 'membro' }));
    const op = env.authenticatedContext('o', senha('campo@fazenda.com.br', false)).firestore();
    const bal = env.authenticatedContext('b', senha('balanca@fazenda.com.br', false)).firestore();
    const tec = env.authenticatedContext('t', senha('tec@fazenda.com.br', false)).firestore();
    const { deleteDoc, updateDoc } = await import('firebase/firestore');
    const carga = (db: Firestore, id = 'k1') => doc(collection(db, 'fazendas', FID, 'cargas'), id);
    // operador registra a saída (sem peso), mas não lança peso
    await assertSucceeds(setDoc(carga(op), { talhaoId: 't1', saidaEm: '2026-11-14T07:00', pesoBrutoKg: null, taraKg: null }));
    await assertSucceeds(updateDoc(carga(op), { placa: 'ABC1D23' }));
    await assertFails(updateDoc(carga(op), { pesoBrutoKg: 40000, taraKg: 15000 }));
    await assertFails(updateDoc(carga(op), { romaneio: '1234' }));
    await assertFails(setDoc(carga(op, 'k2'), { talhaoId: 't1', saidaEm: '2026-11-14T08:00', pesoBrutoKg: 40000, taraKg: 15000 }));
    // membro (não balanceiro) também não pesa
    await assertFails(updateDoc(carga(tec), { pesoBrutoKg: 40000, taraKg: 15000 }));
    // balanceiro pesa, mas não exclui nem edita talhões
    await assertSucceeds(updateDoc(carga(bal), { pesoBrutoKg: 40000, taraKg: 15000, pesadoEm: '2026-11-14T09:00:00Z' }));
    await assertFails(deleteDoc(carga(bal)));
    await assertFails(updateDoc(talhao(bal), { capim: 'Mombaça' }));
    // colheita finalizada: só o e-mail em finalizadoresColheita() marca e desmarca
    await assertSucceeds(setDoc(membro(admin, 'outra.admin@fazenda.com.br'), { nome: 'Outra', papel: 'admin' }));
    const outroAdmin = env.authenticatedContext('m', senha('outra.admin@fazenda.com.br', false)).firestore();
    await assertFails(updateDoc(talhao(op), { colheitaFinalizadaEm: '2026-11-20' }));
    await assertFails(updateDoc(talhao(bal), { colheitaFinalizadaEm: '2026-11-20' }));
    await assertFails(updateDoc(talhao(tec), { colheitaFinalizadaEm: '2026-11-20' }));
    await assertFails(updateDoc(talhao(outroAdmin), { colheitaFinalizadaEm: '2026-11-20' }));
    await assertSucceeds(updateDoc(talhao(tec), { capim: 'Mombaça' })); // membro segue editando o cadastro
    await assertSucceeds(updateDoc(talhao(admin), { colheitaFinalizadaEm: '2026-11-20' }));
    await assertFails(updateDoc(talhao(tec), { colheitaFinalizadaEm: null }));
    await assertSucceeds(updateDoc(talhao(admin), { colheitaFinalizadaEm: null }));
    // carga do relatório da balança já entra pesada: administrador e balanceiro criam com peso; membro exclui
    await assertSucceeds(setDoc(carga(admin, 'k3'), { talhaoId: 't1', saidaEm: '2026-11-14T10:00', pesoBrutoKg: 41000, taraKg: 15000, romaneio: '101' }));
    await assertSucceeds(setDoc(carga(bal, 'k4'), { talhaoId: 't1', saidaEm: '2026-11-14T11:00', pesoBrutoKg: 41000, taraKg: 15000, romaneio: '102' }));
    await assertFails(setDoc(carga(tec, 'k5'), { talhaoId: 't1', saidaEm: '2026-11-14T12:00', pesoBrutoKg: 41000, taraKg: 15000 }));
    // carga pesada: só o e-mail em excluidoresCargasPesadas() exclui (nem membro, nem a outra administradora)
    await assertFails(deleteDoc(carga(tec)));
    await assertFails(deleteDoc(carga(outroAdmin, 'k3')));
    await assertSucceeds(deleteDoc(carga(admin)));
    // carga sem peso: membro segue excluindo
    await assertSucceeds(setDoc(carga(op, 'k6'), { talhaoId: 't1', saidaEm: '2026-11-14T13:00', pesoBrutoKg: null, taraKg: null }));
    await assertSucceeds(deleteDoc(carga(tec, 'k6')));
  });

  it('veículos: todos leem; só o gestor de veículos cadastra, edita e remove', async () => {
    const gestor = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(gestor, 'outra.admin@fazenda.com.br'), { nome: 'Outra', papel: 'admin' }));
    const outroAdmin = env.authenticatedContext('m', senha('outra.admin@fazenda.com.br', false)).firestore();
    await assertSucceeds(setDoc(membro(gestor, 'campo2@fazenda.com.br'), { nome: 'Campo', papel: 'operador' }));
    const op = env.authenticatedContext('o2', senha('campo2@fazenda.com.br', false)).firestore();
    const { deleteDoc, updateDoc, getDoc } = await import('firebase/firestore');
    const veiculo = (db: Firestore) => doc(collection(db, 'fazendas', FID, 'veiculos'), 'v1');
    await assertSucceeds(setDoc(veiculo(gestor), { numero: 1, motorista: 'Vitor Alonso', placa: 'CPG0247' }));
    await assertSucceeds(getDoc(veiculo(op)));
    await assertFails(updateDoc(veiculo(op), { motorista: 'Outro' }));
    await assertFails(setDoc(doc(collection(outroAdmin, 'fazendas', FID, 'veiculos'), 'v2'), { motorista: 'X', placa: 'ABC1234' }));
    await assertFails(setDoc(doc(collection(gestor, 'fazendas', FID, 'veiculos'), 'v3'), { motorista: 'Sem placa' }));
    await assertSucceeds(updateDoc(veiculo(gestor), { placa: 'CPG0248' }));
    await assertFails(deleteDoc(veiculo(op)));
    await assertSucceeds(deleteDoc(veiculo(gestor)));
  });

  it('amostras de colheita: operador registra e lança MS, mas não exclui; membro exclui', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(admin, 'campo3@fazenda.com.br'), { nome: 'Campo', papel: 'operador' }));
    await assertSucceeds(setDoc(membro(admin, 'tec3@fazenda.com.br'), { nome: 'Técnico', papel: 'membro' }));
    const op = env.authenticatedContext('o3', senha('campo3@fazenda.com.br', false)).firestore();
    const tec = env.authenticatedContext('t3', senha('tec3@fazenda.com.br', false)).firestore();
    const { deleteDoc, updateDoc } = await import('firebase/firestore');
    const ac = (db: Firestore) => doc(collection(db, 'fazendas', FID, 'amostrasColheita'), 'ac1');
    await assertSucceeds(setDoc(ac(op), { talhaoId: 't1', coletadaEm: '2026-11-17T08:00', placa: 'CPG0247', silo: 'Silo 1', peneira19G: 20, peneira8G: 100, peneira4G: 60, fundoG: 20, pesoUmidoG: null, pesoSecoG: null }));
    await assertSucceeds(updateDoc(ac(op), { pesoUmidoG: 100, pesoSecoG: 31 }));
    await assertFails(deleteDoc(ac(op)));
    await assertSucceeds(deleteDoc(ac(tec)));
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

  it('histórico: todo membro registra; só a auditora lê e marca restaurado; ninguém apaga', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(admin, 'campo@fazenda.com.br'), { nome: 'Campo', papel: 'operador' }));
    await assertSucceeds(setDoc(membro(admin, 'outro.admin@fazenda.com.br'), { nome: 'Outro', papel: 'admin' }));
    const op = env.authenticatedContext('o', senha('campo@fazenda.com.br', false)).firestore();
    const outroAdmin = env.authenticatedContext('x', senha('outro.admin@fazenda.com.br', false)).firestore();
    const h = (db: Firestore) => doc(collection(db, 'fazendas', FID, 'historico'), 'h1');
    await assertSucceeds(setDoc(h(op), { em: '2026-11-11T10:00:00Z', quem: 'campo@fazenda.com.br', acao: 'excluiu', descricao: 'coleta X' }));
    await assertFails(getDocs(collection(op, 'fazendas', FID, 'historico')));
    await assertFails(getDocs(collection(outroAdmin, 'fazendas', FID, 'historico'))); // admin, mas não auditor
    await assertSucceeds(getDocs(collection(admin, 'fazendas', FID, 'historico')));
    const { deleteDoc, updateDoc } = await import('firebase/firestore');
    await assertFails(updateDoc(h(op), { restauradoEm: '2026-11-11T11:00:00Z', restauradoPor: 'campo@fazenda.com.br' }));
    await assertFails(updateDoc(h(outroAdmin), { restauradoEm: '2026-11-11T11:00:00Z', restauradoPor: 'outro.admin@fazenda.com.br' }));
    await assertFails(updateDoc(h(admin), { descricao: 'outra' }));
    await assertSucceeds(updateDoc(h(admin), { restauradoEm: '2026-11-11T11:00:00Z', restauradoPor: ADMIN }));
    await assertFails(deleteDoc(h(admin)));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anon, 'fazendas', FID, 'historico')));
  });

  it('parâmetros da estimativa: todo membro lê; só admin grava', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(admin, 'tec@fazenda.com.br'), { nome: 'Téc', papel: 'membro' }));
    const cfg = (db: Firestore) => doc(collection(db, 'fazendas', FID, 'config'), 'parametros');
    await assertSucceeds(setDoc(cfg(admin), { perdasPct: 12, densidadeKgM3: 650, msMin: 30, msMax: 35 }));
    const tec = env.authenticatedContext('t', senha('tec@fazenda.com.br', false)).firestore();
    await assertSucceeds(getDoc(cfg(tec)));
    await assertFails(setDoc(cfg(tec), { perdasPct: 5, densidadeKgM3: 650, msMin: 30, msMax: 35 }));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(cfg(anon)));
  });

  it('talhões excluídos: quem exclui talhão registra na lista; operador não; todo membro lê', async () => {
    const { arrayUnion, deleteDoc } = await import('firebase/firestore');
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(admin, 'tec@fazenda.com.br'), { nome: 'Téc', papel: 'membro' }));
    await assertSucceeds(setDoc(membro(admin, 'campo@fazenda.com.br'), { nome: 'Campo', papel: 'operador' }));
    const lista = (db: Firestore) => doc(collection(db, 'fazendas', FID, 'config'), 'talhoesExcluidos');
    const tec = env.authenticatedContext('t', senha('tec@fazenda.com.br', false)).firestore();
    await assertSucceeds(setDoc(lista(tec), { chaves: arrayUnion('CAU|1') }, { merge: true }));
    await assertFails(setDoc(lista(tec), { chaves: ['X|1'], outro: 1 }));
    await assertFails(deleteDoc(lista(tec)));
    const op = env.authenticatedContext('o', senha('campo@fazenda.com.br', false)).firestore();
    await assertFails(setDoc(lista(op), { chaves: arrayUnion('PD|2') }, { merge: true }));
    const lido = await assertSucceeds(getDoc(lista(op)));
    expect(lido.data()?.chaves).toEqual(['CAU|1']);
  });

  it('admin não remove a si mesmo da lista nem muda o próprio papel; muda o dos outros', async () => {
    const admin = env.authenticatedContext('a', google(ADMIN)).firestore();
    await assertSucceeds(setDoc(membro(admin, ADMIN), { nome: 'Eu', papel: 'admin' }));
    const { deleteDoc, updateDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(membro(admin, ADMIN)));
    await assertFails(updateDoc(membro(admin, ADMIN), { papel: 'membro' }));
    await assertSucceeds(updateDoc(membro(admin, ADMIN), { nome: 'Eu mesma' }));
    await assertSucceeds(setDoc(membro(admin, 'campo@fazenda.com.br'), { nome: 'Campo', papel: 'operador' }));
    await assertSucceeds(updateDoc(membro(admin, 'campo@fazenda.com.br'), { papel: 'membro' }));
    await assertFails(updateDoc(membro(admin, 'campo@fazenda.com.br'), { papel: 'chefe' }));
    // membro comum não muda papel de ninguém
    const campo = env.authenticatedContext('c', senha('campo@fazenda.com.br', false)).firestore();
    await assertFails(updateDoc(membro(campo, 'campo@fazenda.com.br'), { papel: 'admin' }));
  });
});

describe.skipIf(!ativo)('RepositorioFirestore', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJETO_TESTES,
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
    expect(a.obter()).toEqual({ talhoes: [], coletas: [], amostras: [], cargas: [], veiculos: [], amostrasColheita: [] });

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

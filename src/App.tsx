import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { definirRepositorio } from './dados';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';
import { ADMINS, FAZENDA_ID } from './firebaseConfig';
import { inicializarDados } from './inicializacao';
import { papelDe, useMembros } from './membros';
import { PERMISSOES_LOCAL, PermissoesContext, permissoesDoPapel, type Permissoes } from './permissoes';
import { RepositorioLocal, type Repositorio } from './repositorio';
import { RepositorioFirestore } from './repositorioFirestore';
import { sair, useUsuario } from './sessao';
import Painel from './pages/Painel';
import Mapa from './pages/Mapa';
import Talhoes from './pages/Talhoes';
import Coletas from './pages/Coletas';
import NovaColeta from './pages/NovaColeta';
import ColetaDetalhe from './pages/ColetaDetalhe';
import ColetaPontos from './pages/ColetaPontos';
import ColetaPesos from './pages/ColetaPesos';
import Laboratorio from './pages/Laboratorio';
import Config from './pages/Config';
import Login from './pages/Login';

export default function App() {
  return FIREBASE_ATIVO ? <AppNuvem /> : <AppLocal />;
}

/** Sem Firebase configurado: dados só neste aparelho, sem login. */
function AppLocal() {
  const [repo, setRepo] = useState<Repositorio | null>(null);
  useEffect(() => {
    const r = new RepositorioLocal();
    definirRepositorio(r);
    r.iniciar();
    setRepo(r);
    return () => {
      r.parar();
      definirRepositorio(null);
    };
  }, []);
  if (!repo) return null;
  return <Casca repo={repo} permissoes={PERMISSOES_LOCAL} />;
}

/** Com Firebase: exige login; os dados ficam no Firestore (com cache offline). */
function AppNuvem() {
  const usuario = useUsuario();
  const [repo, setRepo] = useState<Repositorio | null>(null);
  const uid = usuario?.uid;

  useEffect(() => {
    if (!uid) {
      setRepo(null);
      definirRepositorio(null);
      return;
    }
    // A conexão com os dados só é aberta em CascaNuvem, depois de confirmar que a conta foi liberada.
    const r = new RepositorioFirestore(obterFirebase().firestore, FAZENDA_ID);
    definirRepositorio(r);
    setRepo(r);
    return () => {
      r.parar();
      definirRepositorio(null);
    };
  }, [uid]);

  if (usuario === undefined) return <p className="vazio">Conectando…</p>;
  if (usuario === null) return <Login />;
  if (!repo) return null;
  return <CascaNuvem repo={repo} usuario={usuario} />;
}

/** Descobre o papel do usuário (lista de membros) antes de montar a interface. */
function CascaNuvem({ repo, usuario }: { repo: Repositorio; usuario: User }) {
  const membros = useMembros();
  const adminFixo = ADMINS.map((a) => a.toLowerCase()).includes((usuario.email ?? '').toLowerCase());
  const liberado = Array.isArray(membros) || (membros === null && adminFixo);
  const [iniciado, setIniciado] = useState(false);

  // Abre a conexão com os dados só quando a conta tem acesso (senão os ouvintes morrem com "acesso negado").
  useEffect(() => {
    if (!liberado) {
      setIniciado(false);
      return;
    }
    repo.iniciar();
    setIniciado(true);
    return () => repo.parar();
  }, [repo, liberado]);

  if (membros === undefined) return <p className="vazio">Conectando…</p>;
  // Não consegue ler a lista de membros e não é admin fixo: conta criada, mas ainda não liberada.
  if (!liberado) return <AguardandoLiberacao usuario={usuario} />;
  if (!iniciado) return null;
  return <Casca repo={repo} usuario={usuario} permissoes={permissoesDoPapel(papelDe(usuario.email, membros))} />;
}

function AguardandoLiberacao({ usuario }: { usuario: User }) {
  return (
    <main className="login">
      <div className="cartao login-cartao">
        <div className="marca login-marca">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={40} height={40} />
          <span>Silagem MS</span>
        </div>
        <h2>Aguardando liberação</h2>
        <p>
          Sua conta <strong>{usuario.email}</strong> foi criada. Um administrador da fazenda precisa liberar o acesso em
          Config → Pessoas com acesso. Avise a Maria Laura ou a Maria. Esta tela atualiza sozinha quando o acesso for liberado.
        </p>
        <div className="acoes">
          <button onClick={() => void sair()}>Sair</button>
        </div>
      </div>
    </main>
  );
}

/** Cabeçalho, navegação e rotas; roda a inicialização (migração, KML, fichas) quando a fonte está pronta. */
function Casca({ repo, usuario, permissoes }: { repo: Repositorio; usuario?: User; permissoes: Permissoes }) {
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    inicializarDados(permissoes)
      .then((m) => ativo && m.length && setAvisos(m))
      .catch((e) => console.error(e));
    return () => {
      ativo = false;
    };
  }, [repo, permissoes.papel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      repo.assinarErros((e) => {
        const codigo = (e as { code?: string }).code ?? '';
        if (codigo === 'permission-denied') {
          setErro(
            permissoes.papel === 'operador'
              ? `Sem permissão para esta ação com o perfil de operador (${usuario?.email ?? ''}). Se você devia ter acesso, peça ao administrador para incluir seu e-mail em Config → Pessoas com acesso.`
              : `Acesso negado para ${usuario?.email ?? 'este usuário'}: peça ao administrador para incluir seu e-mail em Config → Pessoas com acesso.`,
          );
        } else {
          setErro(`Falha ao gravar: ${e.message}`);
        }
      }),
    [repo, usuario?.email, permissoes.papel],
  );

  return (
    <PermissoesContext.Provider value={permissoes}>
      <HashRouter>
        <header className="topo">
          <div className="marca">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
            <span>Silagem MS</span>
          </div>
          <nav>
            <NavLink to="/" end><span className="icone" aria-hidden>📊</span><span>Painel</span></NavLink>
            <NavLink to="/mapa"><span className="icone" aria-hidden>🗺️</span><span>Mapa</span></NavLink>
            <NavLink to="/coletas"><span className="icone" aria-hidden>📋</span><span>Campo</span></NavLink>
            <NavLink to="/laboratorio"><span className="icone" aria-hidden>🧪</span><span>Lab</span></NavLink>
            <NavLink to="/talhoes"><span className="icone" aria-hidden>🌱</span><span>Talhões</span></NavLink>
            <NavLink to="/config"><span className="icone" aria-hidden>⚙️</span><span>Config.</span></NavLink>
          </nav>
        </header>
        <main>
          {erro && (
            <p className="faixa-erro">
              {erro} <button className="link" onClick={() => setErro('')}>fechar</button>
            </p>
          )}
          {avisos.length > 0 && (
            <p className="aviso">
              {avisos.join(' ')} <button className="link" onClick={() => setAvisos([])}>ok</button>
            </p>
          )}
          <Routes>
            <Route path="/" element={<Painel />} />
            <Route path="/mapa" element={<Mapa />} />
            <Route path="/talhoes" element={<Talhoes />} />
            <Route path="/coletas" element={<Coletas />} />
            <Route path="/coletas/nova" element={<NovaColeta />} />
            <Route path="/coletas/:id/pontos" element={<ColetaPontos />} />
            <Route path="/coletas/:id/pesos" element={<ColetaPesos />} />
            <Route path="/coletas/:id" element={<ColetaDetalhe />} />
            <Route path="/laboratorio" element={<Laboratorio />} />
            <Route path="/config" element={<Config usuario={usuario} />} />
          </Routes>
        </main>
      </HashRouter>
    </PermissoesContext.Provider>
  );
}

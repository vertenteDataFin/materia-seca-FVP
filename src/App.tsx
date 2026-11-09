import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { definirRepositorio } from './dados';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';
import { FAZENDA_ID } from './firebaseConfig';
import { inicializarDados } from './inicializacao';
import { RepositorioLocal, type Repositorio } from './repositorio';
import { RepositorioFirestore } from './repositorioFirestore';
import { enviarVerificacao, mensagemErroAuth, precisaVerificarEmail, sair, useUsuario } from './sessao';
import Painel from './pages/Painel';
import Mapa from './pages/Mapa';
import Talhoes from './pages/Talhoes';
import Coletas from './pages/Coletas';
import NovaColeta from './pages/NovaColeta';
import ColetaDetalhe from './pages/ColetaDetalhe';
import ColetaPontos from './pages/ColetaPontos';
import ColetaPesos from './pages/ColetaPesos';
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
  return <Casca repo={repo} />;
}

/** Com Firebase: exige login; os dados ficam no Firestore (com cache offline). */
function AppNuvem() {
  const usuario = useUsuario();
  const [, forcar] = useState(0);
  const [repo, setRepo] = useState<Repositorio | null>(null);
  const liberado = !!usuario && !precisaVerificarEmail(usuario);
  const uid = usuario?.uid;

  useEffect(() => {
    if (!liberado) {
      setRepo(null);
      definirRepositorio(null);
      return;
    }
    const r = new RepositorioFirestore(obterFirebase().firestore, FAZENDA_ID);
    definirRepositorio(r);
    r.iniciar();
    setRepo(r);
    return () => {
      r.parar();
      definirRepositorio(null);
    };
  }, [liberado, uid]);

  if (usuario === undefined) return <p className="vazio">Conectando…</p>;
  if (usuario === null) return <Login />;
  if (precisaVerificarEmail(usuario)) return <VerificarEmail usuario={usuario} aoAtualizar={() => forcar((n) => n + 1)} />;
  if (!repo) return null;
  return <Casca repo={repo} usuario={usuario} />;
}

function VerificarEmail({ usuario, aoAtualizar }: { usuario: User; aoAtualizar: () => void }) {
  const [msg, setMsg] = useState('');
  return (
    <main className="login">
      <div className="cartao login-cartao">
        <h2>Confirme seu e-mail</h2>
        <p>
          Enviamos um link de confirmação para <strong>{usuario.email}</strong>. Abra o e-mail, clique no link e depois toque em
          "Já confirmei".
        </p>
        <div className="acoes">
          <button
            className="primario"
            onClick={async () => {
              await usuario.reload();
              aoAtualizar();
              if (!usuario.emailVerified) setMsg('Ainda não consta como confirmado. Confira a caixa de spam ou reenvie.');
            }}
          >
            Já confirmei
          </button>
          <button
            onClick={() =>
              enviarVerificacao(usuario)
                .then(() => setMsg('E-mail reenviado.'))
                .catch((e) => setMsg(mensagemErroAuth(e)))
            }
          >
            Reenviar e-mail
          </button>
          <button onClick={() => void sair()}>Sair</button>
        </div>
        {msg && <p className="aviso">{msg}</p>}
      </div>
    </main>
  );
}

/** Cabeçalho, navegação e rotas; roda a inicialização (migração, KML, fichas) quando a fonte está pronta. */
function Casca({ repo, usuario }: { repo: Repositorio; usuario?: User }) {
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    inicializarDados()
      .then((m) => ativo && m.length && setAvisos(m))
      .catch((e) => console.error(e));
    return () => {
      ativo = false;
    };
  }, [repo]);

  useEffect(
    () =>
      repo.assinarErros((e) => {
        const codigo = (e as { code?: string }).code ?? '';
        if (codigo === 'permission-denied') {
          setErro(`Acesso negado para ${usuario?.email ?? 'este usuário'}: peça ao administrador para incluir seu e-mail em Config → Pessoas com acesso.`);
        } else {
          setErro(`Falha ao gravar: ${e.message}`);
        }
      }),
    [repo, usuario?.email],
  );

  return (
    <HashRouter>
      <header className="topo">
        <div className="marca">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
          <span>Silagem MS</span>
        </div>
        <nav>
          <NavLink to="/" end><span className="icone" aria-hidden>📊</span><span>Painel</span></NavLink>
          <NavLink to="/mapa"><span className="icone" aria-hidden>🗺️</span><span>Mapa</span></NavLink>
          <NavLink to="/coletas"><span className="icone" aria-hidden>📋</span><span>Coletas</span></NavLink>
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
          <Route path="/config" element={<Config usuario={usuario} />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

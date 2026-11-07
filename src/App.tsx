import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { importarTalhoesFazenda } from './importarFazenda';
import { importarColetasIniciais } from './coletasIniciais';
import Painel from './pages/Painel';
import Mapa from './pages/Mapa';
import Talhoes from './pages/Talhoes';
import Coletas from './pages/Coletas';
import NovaColeta from './pages/NovaColeta';
import ColetaDetalhe from './pages/ColetaDetalhe';
import ColetaPontos from './pages/ColetaPontos';
import ColetaPesos from './pages/ColetaPesos';
import Config from './pages/Config';

// Mude a versão para forçar uma nova sincronização com o KML embutido (edições do usuário são preservadas).
const CHAVE_SEED = 'silagem-ms:talhoes-carregados-v3';
// Coletas já feitas em campo (fichas de 06–07/11/2026) entram uma vez por aparelho; não duplicam.
const CHAVE_COLETAS = 'silagem-ms:coletas-iniciais-v1';

/** Na primeira abertura (ou nova versão do KML), carrega/sincroniza os talhões da fazenda e as coletas já feitas. */
function useTalhoesIniciais() {
  const [pronto, setPronto] = useState(() => localStorage.getItem(CHAVE_SEED) === '1');
  useEffect(() => {
    if (pronto) return;
    (async () => {
      try {
        await importarTalhoesFazenda();
      } catch (e) {
        console.error('Falha ao carregar talhões iniciais', e);
      } finally {
        localStorage.setItem(CHAVE_SEED, '1');
        setPronto(true);
      }
    })();
  }, [pronto]);
  useEffect(() => {
    if (!pronto || localStorage.getItem(CHAVE_COLETAS) === '1') return;
    importarColetasIniciais()
      .then(() => localStorage.setItem(CHAVE_COLETAS, '1'))
      .catch((e) => console.error('Falha ao carregar coletas iniciais', e));
  }, [pronto]);
  return pronto;
}

export default function App() {
  const pronto = useTalhoesIniciais();
  if (!pronto) return <p className="vazio">Carregando talhões da fazenda…</p>;
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
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/talhoes" element={<Talhoes />} />
          <Route path="/coletas" element={<Coletas />} />
          <Route path="/coletas/nova" element={<NovaColeta />} />
          <Route path="/coletas/:id/pontos" element={<ColetaPontos />} />
          <Route path="/coletas/:id/pesos" element={<ColetaPesos />} />
          <Route path="/coletas/:id" element={<ColetaDetalhe />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

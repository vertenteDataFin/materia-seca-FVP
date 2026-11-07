import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { importarTalhoesFazenda } from './importarFazenda';
import Painel from './pages/Painel';
import Mapa from './pages/Mapa';
import Talhoes from './pages/Talhoes';
import Coletas from './pages/Coletas';
import NovaColeta from './pages/NovaColeta';
import ColetaDetalhe from './pages/ColetaDetalhe';
import Config from './pages/Config';

// Mude a versão para forçar uma nova sincronização com o KML embutido (edições do usuário são preservadas).
const CHAVE_SEED = 'silagem-ms:talhoes-carregados-v3';

/** Na primeira abertura (ou nova versão do KML), carrega/sincroniza os talhões da fazenda. */
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
          <NavLink to="/" end>Painel</NavLink>
          <NavLink to="/mapa">Mapa</NavLink>
          <NavLink to="/coletas">Coletas</NavLink>
          <NavLink to="/talhoes">Talhões</NavLink>
          <NavLink to="/config">Config.</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/talhoes" element={<Talhoes />} />
          <Route path="/coletas" element={<Coletas />} />
          <Route path="/coletas/nova" element={<NovaColeta />} />
          <Route path="/coletas/:id" element={<ColetaDetalhe />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

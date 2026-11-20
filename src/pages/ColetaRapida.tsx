import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDados } from '../dados';
import { criarColeta } from '../coletas';
import { usePermissoes } from '../permissoes';
import { capturarPosicao, type Posicao } from '../geo';
import { talhoesPorPosicao } from '../talhaoPorGps';
import type { Talhao } from '../tipos';
import { fmt, hoje } from '../util';
import { Icone } from '../Icone';

/**
 * Coleta de campo (padrão), passo 1: o GPS já diz em que talhão a pessoa está.
 * Um toque começa a coleta (data de hoje, responsável = quem está logado) e vai direto para o campo.
 */
export default function ColetaRapida() {
  const dados = useDados();
  const navigate = useNavigate();
  const { nomeUsuario } = usePermissoes();
  const [pos, setPos] = useState<Posicao | null>(null);
  const [lendo, setLendo] = useState(true);
  const [erro, setErro] = useState('');
  const [outroId, setOutroId] = useState('');

  async function lerGps() {
    setLendo(true);
    setErro('');
    try {
      setPos(await capturarPosicao());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  }

  useEffect(() => {
    lerGps();
  }, []);

  if (!dados) return null;
  const dia = hoje();
  const deHoje = (t: Talhao) => dados.coletas.find((c) => c.talhaoId === t.id && c.data === dia);

  function comecar(t: Talhao) {
    const existente = deHoje(t);
    const id = existente?.id ?? criarColeta(t.id, {}, nomeUsuario);
    navigate(`/coletas/${id}/campo`);
  }

  const proximos = pos ? talhoesPorPosicao(dados.talhoes, pos).slice(0, 4) : [];
  const aqui = proximos[0]?.dentro ? proximos[0] : null;
  const outros = aqui ? proximos.slice(1) : proximos;

  return (
    <div className="coleta-rapida">
      <div className="titulo-linha">
        <h1>Coleta de campo</h1>
      </div>

      <div className="cartao">
        {lendo ? (
          <p className="gps-lendo"><Icone nome="gps" /> Procurando você no mapa…</p>
        ) : aqui ? (
          <>
            <p className="mudo">Você está no</p>
            <h2 className="talhao-aqui">{aqui.talhao.nome}</h2>
            <p className="mudo">
              {aqui.talhao.capim || 'capim não informado'}
              {aqui.talhao.areaHa > 0 ? ` · ${fmt(aqui.talhao.areaHa, 1)} ha` : ''}
              {pos?.precisaoM != null ? ` · GPS ±${pos.precisaoM} m` : ''}
            </p>
            <button type="button" className="primario botao-grande" onClick={() => comecar(aqui.talhao)}>
              {deHoje(aqui.talhao) ? 'Continuar a coleta de hoje' : 'Começar coleta aqui'}
            </button>
          </>
        ) : (
          <p className="aviso">
            {erro || 'Você não está dentro de nenhum talhão do mapa.'}{' '}
            <button type="button" className="link" onClick={lerGps}>Tentar de novo</button>
          </p>
        )}
      </div>

      {!lendo && outros.length > 0 && (
        <div className="cartao">
          <h2>{aqui ? 'Não é esse? Talhões perto' : 'Talhões mais perto'}</h2>
          <div className="lista-escolha">
            {outros.map((p) => (
              <button key={p.talhao.id} type="button" onClick={() => comecar(p.talhao)}>
                <strong>{p.talhao.nome}</strong>
                <small className="mudo">{p.distanciaM < 1000 ? `${fmt(p.distanciaM, 0)} m` : `${fmt(p.distanciaM / 1000, 1)} km`}{deHoje(p.talhao) ? ' · coleta de hoje aberta' : ''}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {!lendo && (
        <div className="cartao">
          <label>
            Outro talhão
            <select value={outroId} onChange={(e) => setOutroId(e.target.value)}>
              <option value="">Escolha…</option>
              {dados.talhoes.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
          {outroId && (
            <div className="acoes" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="primario" onClick={() => comecar(dados.talhoes.find((t) => t.id === outroId)!)}>Começar coleta</button>
            </div>
          )}
        </div>
      )}

      <p className="dica">Prefere marcar os pontos tocando no mapa? <Link to="/mapa?nova=coleta">Coleta pelo mapa</Link>.</p>
    </div>
  );
}

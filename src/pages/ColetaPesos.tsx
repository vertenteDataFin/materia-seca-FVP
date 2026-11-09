import { Link, useParams } from 'react-router-dom';
import { atualizarAmostra, atualizarColeta, useDados } from '../dados';
import type { Amostra } from '../tipos';
import { adicionarPonto, lembrarUltimos } from '../coletas';
import { producaoPonto, resumoColeta } from '../calc';
import { CampoNumero, Indicador, PassosColeta } from '../components';
import { dentroDoTalhao, fmtCoord } from '../geo';
import { codigoAmostra } from '../fluxo';
import { fmt, fmtData } from '../util';

/** Etapa 3: peso verde (massa fresca) de cada ponto. */
export default function ColetaPesos() {
  const coletaId = useParams().id!;
  const dados = useDados();

  if (!dados) return null;
  const coleta = dados.coletas.find((c) => c.id === coletaId);
  if (!coleta) {
    return (
      <div className="cartao">
        <p className="vazio">Coleta não encontrada. <Link to="/coletas">Voltar</Link></p>
      </div>
    );
  }
  const amostras = dados.amostras.filter((a) => a.coletaId === coletaId);
  const talhao = dados.talhoes.find((t) => t.id === coleta.talhaoId);

  const quadro = coleta.areaAmostralM2;
  const r = resumoColeta(coleta, amostras);
  const fora = (a: Amostra) => (a.lat != null && a.lng != null ? dentroDoTalhao(a.lng, a.lat, talhao?.geometria) === false : false);
  const salvarPeso = (a: Amostra, v: number | null) => atualizarAmostra(a.id, { pesoVerdeKg: v });
  const salvarQuadro = (v: number | null) => {
    if (v != null && v > 0) {
      atualizarColeta(coletaId, { areaAmostralM2: v });
      lembrarUltimos(coleta.responsavel, v);
    }
  };

  return (
    <>
      <div className="titulo-linha">
        <h1>Coleta — {talhao ? talhao.nome : '…'} · {fmtData(coleta.data)}</h1>
        <Link to={`/coletas/${coletaId}/pontos`}>← Pontos</Link>
      </div>
      <PassosColeta coletaId={coletaId} atual={3} />

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Peso verde por ponto</h2>
          <label className="linha-check" style={{ margin: 0 }}>
            Quadro (m²)
            <CampoNumero valor={quadro} ariaLabel="Área do quadro (m²)" aoSalvar={salvarQuadro} />
          </label>
        </div>
        <p className="dica">
          Pese o capim cortado dentro do quadro em cada ponto.{' '}
          {quadro === 1 ? 'Com quadro de 1 m², o peso em kg já é a massa verde em kg/m².' : `O app divide pelo quadro de ${fmt(quadro, 2)} m² para obter kg/m².`}{' '}
          Separe a subamostra para MS e etiquete o saco com o <strong>código</strong> do ponto.
        </p>

        {!amostras.length ? (
          <p className="vazio">
            Nenhum ponto marcado. <Link to={`/coletas/${coletaId}/pontos`}>Marcar no mapa</Link> ou{' '}
            <button className="link" onClick={() => adicionarPonto(coletaId)}>adicionar ponto sem posição</button>.
          </p>
        ) : (
          <div className="pesos">
            {amostras.map((a) => (
              <div key={a.id} className={`peso-linha ${fora(a) ? 'fora' : ''}`}>
                <div>
                  <strong>Ponto {a.ponto}</strong> <code className="codigo">{codigoAmostra(talhao?.nome ?? '', coleta.data, a.ponto)}</code>
                  <div className="mudo"><small>{a.lat != null && a.lng != null ? fmtCoord(a.lat, a.lng) : 'sem posição'}{fora(a) ? ' · fora do talhão' : ''}</small></div>
                </div>
                <label>
                  Peso verde (kg)
                  <CampoNumero valor={a.pesoVerdeKg} ariaLabel={`Peso verde ponto ${a.ponto}`} aoSalvar={(v) => salvarPeso(a, v)} />
                </label>
                <div className="n">
                  <strong>{fmt(producaoPonto(a, quadro), 2)}</strong> <small className="mudo">kg/m²</small>
                </div>
              </div>
            ))}
          </div>
        )}
        {amostras.length > 0 && (
          <div className="acoes" style={{ marginTop: '0.75rem' }}>
            <button onClick={() => adicionarPonto(coletaId)}>+ Ponto sem posição</button>
          </div>
        )}
      </div>

      {r.nPontos > 0 && (
        <div className="cartao">
          <h2>Parcial</h2>
          <div className="indicadores">
            <Indicador rotulo="Pontos pesados" valor={`${r.nPontos} de ${amostras.length}`} />
            <Indicador rotulo="Massa verde média" valor={fmt(r.mvKgM2, 2)} unidade="kg/m²" />
            <Indicador rotulo="Produção verde" valor={fmt(r.tMVha)} unidade="t MV/ha" />
            <Indicador rotulo="CV entre pontos" valor={fmt(r.cvPct)} unidade="%" />
          </div>
          {r.cvPct != null && r.cvPct > 25 && <p className="aviso">Variação alta entre pontos (CV &gt; 25 %): vale marcar e pesar mais pontos.</p>}
        </div>
      )}

      <div className="acoes">
        <Link className="botao" to={`/coletas/${coletaId}/pontos`}>← Pontos</Link>
        <Link className="botao primario" to="/coletas">Concluir coleta de campo</Link>
        <Link className="botao" to={`/laboratorio?coleta=${coletaId}`}>Lançar MS agora (laboratório)</Link>
      </div>
      <p className="dica">A MS (peso úmido e seco da subamostra) é lançada depois, no módulo Laboratório. O resultado completo fica em "Abrir" na lista de coletas.</p>
    </>
  );
}

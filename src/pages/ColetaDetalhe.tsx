import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adicionarAmostra, atualizarAmostra, atualizarColeta, excluirAmostra, excluirColeta, useDados } from '../dados';
import type { Amostra, Coleta, Talhao } from '../tipos';
import { estimativaTalhao, producaoPonto, resumoColeta, statusMS, teorMS, teorUmidade } from '../calc';
import { CampoNumero, Indicador, PassosColeta, SeloMS, useCelular } from '../components';
import { capturarPosicao, dentroDoTalhao, fmtCoord } from '../geo';
import MapaTalhoes, { type Marcador } from '../MapaTalhoes';
import { fmt } from '../util';
import { useParametros } from '../parametros';
import { usePermissoes } from '../permissoes';
import { codigoAmostra, ROTULO_STATUS_COLETA, statusColeta } from '../fluxo';

export default function ColetaDetalhe() {
  const navigate = useNavigate();
  const coletaId = useParams().id!;
  const dados = useDados();
  const parametros = useParametros();
  const [capturando, setCapturando] = useState<string | 'novo' | null>(null);
  const [erroGps, setErroGps] = useState('');
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const celular = useCelular();
  const { podeExcluir } = usePermissoes();

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
  const talhoes = dados.talhoes;
  const talhao = talhoes.find((t) => t.id === coleta.talhaoId);
  const r = resumoColeta(coleta, amostras);
  const est = talhao ? estimativaTalhao(talhao.areaHa, r, parametros) : null;

  /** Lê o GPS e grava na amostra. */
  async function capturarGps(amostraId: string) {
    setCapturando(amostraId);
    setErroGps('');
    try {
      const p = await capturarPosicao();
      atualizarAmostra(amostraId, { lat: p.lat, lng: p.lng, precisaoM: p.precisaoM, capturadoEm: p.capturadoEm });
    } catch (e) {
      setErroGps((e as Error).message);
    } finally {
      setCapturando(null);
    }
  }

  /** Cria um novo ponto e já captura a posição onde o usuário está. */
  async function adicionarPonto() {
    const proximo = amostras.reduce((m, a) => Math.max(m, a.ponto), 0) + 1;
    setCapturando('novo');
    const id = adicionarAmostra({ coletaId, ponto: proximo, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null });
    await capturarGps(id);
  }

  function excluir() {
    if (confirm('Excluir esta coleta e todas as suas amostras?')) {
      excluirColeta(coletaId);
      navigate('/coletas');
    }
  }

  const fora = (a: Amostra) => (a.lat != null && a.lng != null ? dentroDoTalhao(a.lng, a.lat, talhao?.geometria) === false : false);
  const marcadores: Marcador[] = amostras
    .filter((a) => a.lat != null && a.lng != null)
    .map((a) => ({ lat: a.lat!, lng: a.lng!, rotulo: String(a.ponto), alerta: fora(a), titulo: fmtCoord(a.lat!, a.lng!) }));
  const nFora = amostras.filter(fora).length;
  const nSemGps = amostras.filter((a) => a.lat == null).length;

  const statusGps = (a: Amostra) =>
    a.lat != null && a.lng != null ? (
      <span className={fora(a) ? 'gps-fora' : 'gps-ok'} title={`${fmtCoord(a.lat, a.lng)}${a.capturadoEm ? ` · ${new Date(a.capturadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}>
        {fora(a) ? '⚠ fora' : '✓'}{a.precisaoM != null && ` ±${a.precisaoM} m`}
      </span>
    ) : (
      <span className="mudo">sem posição</span>
    );
  const botaoGps = (a: Amostra) => {
    const temGps = a.lat != null && a.lng != null;
    return (
      <button
        className="mini"
        aria-label={`Capturar GPS do ponto ${a.ponto}`}
        title={temGps ? 'Recapturar posição' : 'Capturar posição'}
        disabled={capturando != null}
        onClick={() => capturarGps(a.id)}
      >
        {capturando === a.id ? '…' : temGps ? '↻' : '📍'}
      </button>
    );
  };
  const botaoRemover = (a: Amostra) =>
    podeExcluir ? (
      <button className="perigo mini" aria-label={`Remover ponto ${a.ponto}`} onClick={() => confirm(`Remover o ponto ${a.ponto}?`) && excluirAmostra(a.id)}>✕</button>
    ) : null;

  return (
    <>
      <div className="titulo-linha">
        <h1>Coleta — {talhao ? talhao.nome : 'talhão removido'}</h1>
        <Link to="/coletas">← Coletas</Link>
      </div>
      <PassosColeta coletaId={coletaId} atual={4} />

      <CabecalhoColeta coleta={coleta} talhoes={talhoes} />

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Pontos amostrados</h2>
          <button className="primario" onClick={adicionarPonto} disabled={capturando != null}>
            {capturando === 'novo' ? 'Lendo GPS…' : '📍 Novo ponto aqui'}
          </button>
        </div>
        <p className="dica">
          Situação: <strong>{ROTULO_STATUS_COLETA[statusColeta(amostras)]}</strong>. Peso verde = massa cortada no quadro de {fmt(coleta.areaAmostralM2, 2)} m² (campo);
          úmido e seco da subamostra (já sem a tara) dão a MS e normalmente são lançados em <Link to={`/laboratorio?coleta=${coletaId}`}>Laboratório</Link>, mas
          também podem ser editados aqui. <strong>Novo ponto aqui</strong> cria um ponto na sua posição GPS.
        </p>
        {erroGps && <p className="aviso">{erroGps} — o ponto foi criado sem posição; use ↻ para tentar de novo.</p>}
        {nFora > 0 && <p className="aviso">{nFora} ponto(s) com GPS fora do contorno do talhão (marcados em vermelho). Confira o talhão da coleta.</p>}

        {celular ? (
          <div className="pontos">
            {amostras.map((a) => {
              const ms = teorMS(a);
              const invalido = a.pesoUmidoG != null && a.pesoSecoG != null && ms == null;
              return (
                <div key={a.id} className={`ponto ${fora(a) ? 'ponto-fora' : ''}`}>
                  <div className="ponto-topo">
                    <strong>Ponto {a.ponto}</strong>
                    <code className="codigo">{codigoAmostra(talhao?.nome ?? '', coleta.data, a.ponto)}</code>
                    {statusGps(a)}
                    {botaoGps(a)}
                    <span className="espaco" />
                    {botaoRemover(a)}
                  </div>
                  <div className="ponto-campos">
                    <label>
                      Peso verde (kg)
                      <CampoNumero valor={a.pesoVerdeKg} ariaLabel={`Peso verde ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, { pesoVerdeKg: v })} />
                    </label>
                    <label>
                      Úmido (g)
                      <CampoNumero valor={a.pesoUmidoG} ariaLabel={`Peso úmido ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, { pesoUmidoG: v })} />
                    </label>
                    <label>
                      Seco (g)
                      <CampoNumero valor={a.pesoSecoG} ariaLabel={`Peso seco ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, { pesoSecoG: v })} />
                    </label>
                  </div>
                  <div className="ponto-resultado">
                    <span><span className="mudo">MV</span> <strong>{fmt(producaoPonto(a, coleta.areaAmostralM2), 2)}</strong> kg/m²</span>
                    <span className={invalido ? 'erro' : ''}><span className="mudo">MS</span> <strong>{invalido ? 'seco > úmido' : fmt(ms)}</strong>{!invalido && ' %'}</span>
                    <span><span className="mudo">Umidade</span> <strong>{fmt(teorUmidade(a))}</strong> %</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="rolagem">
          <table className="tabela-amostras">
            <thead>
              <tr>
                <th>Ponto</th>
                <th>GPS</th>
                <th className="n">Peso verde (kg)</th>
                <th className="n">kg/m²</th>
                <th className="n">Úmido (g)</th>
                <th className="n">Seco (g)</th>
                <th className="n">MS %</th>
                <th className="n">Umidade %</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {amostras.map((a) => {
                const ms = teorMS(a);
                const invalido = a.pesoUmidoG != null && a.pesoSecoG != null && ms == null;
                return (
                  <tr key={a.id}>
                    <td><strong>{a.ponto}</strong> <code className="codigo">{codigoAmostra(talhao?.nome ?? '', coleta.data, a.ponto)}</code></td>
                    <td>{statusGps(a)} {botaoGps(a)}</td>
                    <td className="n">
                      <CampoNumero valor={a.pesoVerdeKg} ariaLabel={`Peso verde ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, { pesoVerdeKg: v })} />
                    </td>
                    <td className="n">{fmt(producaoPonto(a, coleta.areaAmostralM2), 2)}</td>
                    <td className="n">
                      <CampoNumero valor={a.pesoUmidoG} ariaLabel={`Peso úmido ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, { pesoUmidoG: v })} />
                    </td>
                    <td className="n">
                      <CampoNumero valor={a.pesoSecoG} ariaLabel={`Peso seco ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, { pesoSecoG: v })} />
                    </td>
                    <td className={`n ${invalido ? 'erro' : ''}`}>{invalido ? 'seco > úmido' : fmt(ms)}</td>
                    <td className="n">{fmt(teorUmidade(a))}</td>
                    <td className="acoes-linha">{botaoRemover(a)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        {nSemGps > 0 && amostras.length > 0 && <p className="dica">{nSemGps} ponto(s) sem posição GPS.</p>}
      </div>

      {!!talhao?.geometria?.length && (
        <div className="cartao">
          <div className="cabecalho-cartao">
            <h2>Mapa dos pontos</h2>
            <button onClick={() => setMostrarMapa((v) => !v)}>{mostrarMapa ? 'Ocultar mapa' : `Ver no mapa (${marcadores.length} ponto(s))`}</button>
          </div>
          {mostrarMapa && <MapaTalhoes talhoes={[talhao]} marcadores={marcadores} altura={340} />}
        </div>
      )}

      <div className="cartao">
        <h2>Resultado da coleta</h2>
        <div className="indicadores">
          <Indicador rotulo="Pontos válidos" valor={`${r.nPontos} / MS em ${r.nPontosMS}`} />
          <Indicador rotulo="Massa verde" valor={fmt(r.mvKgM2, 2)} unidade="kg/m²" />
          <Indicador rotulo="CV entre pontos" valor={fmt(r.cvPct)} unidade="%" />
          <Indicador rotulo="Produção verde" valor={fmt(r.tMVha)} unidade="t MV/ha" />
          <Indicador rotulo="Matéria seca" valor={fmt(r.msPct)} unidade="%" />
          <Indicador rotulo="Umidade" valor={fmt(r.umidadePct)} unidade="%" />
          <Indicador rotulo="Produção de MS" valor={fmt(r.tMSha)} unidade="t MS/ha" />
        </div>
        <p><SeloMS status={statusMS(r.msPct, parametros)} /></p>
        {r.cvPct != null && r.cvPct > 25 && (
          <p className="aviso">Variação alta entre pontos (CV &gt; 25%). Considere amostrar mais pontos para uma estimativa confiável.</p>
        )}
        {talhao && est && (
          <>
            <h3>Estimativa para o talhão ({fmt(talhao.areaHa, 2)} ha)</h3>
            <div className="indicadores">
              <Indicador rotulo="Massa verde total" valor={fmt(est.tMVtotal)} unidade="t" />
              <Indicador rotulo="Matéria seca total" valor={fmt(est.tMStotal)} unidade="t" />
              <Indicador rotulo={`Silagem (−${fmt(parametros.perdasPct, 0)}% perdas)`} valor={fmt(est.silagemT)} unidade="t" />
              <Indicador rotulo={`Volume de silo (${fmt(parametros.densidadeKgM3, 0)} kg/m³)`} valor={fmt(est.volumeM3, 0)} unidade="m³" />
            </div>
          </>
        )}
      </div>

      {podeExcluir && (
        <div className="acoes">
          <button className="perigo" onClick={excluir}>Excluir coleta</button>
        </div>
      )}
    </>
  );
}

function CabecalhoColeta({ coleta, talhoes }: { coleta: Coleta; talhoes: Talhao[] }) {
  const [form, setForm] = useState(coleta);
  useEffect(() => setForm(coleta), [coleta]);
  const salvar = (campos: Partial<Coleta>) => atualizarColeta(coleta.id, campos);

  return (
    <div className="cartao grade-form">
      <label>
        Talhão
        <select value={form.talhaoId} onChange={(e) => salvar({ talhaoId: e.target.value })}>
          {talhoes.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </select>
      </label>
      <label>
        Data
        <input type="date" value={form.data} onChange={(e) => e.target.value && salvar({ data: e.target.value })} />
      </label>
      <label>
        Responsável
        <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} onBlur={() => salvar({ responsavel: form.responsavel.trim() })} />
      </label>
      <label>
        Área do quadro (m²)
        <CampoNumero valor={coleta.areaAmostralM2} aoSalvar={(v) => v != null && v > 0 && salvar({ areaAmostralM2: v })} />
      </label>
      <label className="largo">
        Observações
        <input value={form.observacoes ?? ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} onBlur={() => salvar({ observacoes: form.observacoes })} />
      </label>
    </div>
  );
}

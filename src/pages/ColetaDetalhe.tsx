import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, excluirColeta, type Amostra, type Coleta, type Talhao } from '../db';
import { estimativaTalhao, producaoPonto, resumoColeta, statusMS, teorMS, teorUmidade } from '../calc';
import { CampoNumero, Indicador, SeloMS } from '../components';
import { capturarPosicao, dentroDoTalhao, fmtCoord } from '../geo';
import MapaTalhoes, { nomeCurto, type Marcador } from '../MapaTalhoes';
import { fmt, lerParametros } from '../util';

export default function ColetaDetalhe() {
  const navigate = useNavigate();
  const coletaId = Number(useParams().id);
  const coleta = useLiveQuery(async () => (await db.coletas.get(coletaId)) ?? null, [coletaId]);
  const amostras = useLiveQuery(() => db.amostras.where('coletaId').equals(coletaId).sortBy('ponto'), [coletaId]);
  const talhoes = useLiveQuery(() => db.talhoes.orderBy('nome').toArray(), []);
  const [parametros] = useState(lerParametros);
  const [capturando, setCapturando] = useState<number | 'novo' | null>(null);
  const [erroGps, setErroGps] = useState('');
  const [mostrarMapa, setMostrarMapa] = useState(false);

  if (coleta === null) {
    return (
      <div className="cartao">
        <p className="vazio">Coleta não encontrada. <Link to="/coletas">Voltar</Link></p>
      </div>
    );
  }
  if (!coleta || !amostras || !talhoes) return null;

  const talhao = talhoes.find((t) => t.id === coleta.talhaoId);
  const r = resumoColeta(coleta, amostras);
  const est = talhao ? estimativaTalhao(talhao.areaHa, r, parametros) : null;

  const atualizarAmostra = (id: number, campos: Partial<Amostra>) => db.amostras.update(id, campos);

  /** Lê o GPS e grava na amostra. */
  async function capturarGps(amostraId: number) {
    setCapturando(amostraId);
    setErroGps('');
    try {
      const p = await capturarPosicao();
      await atualizarAmostra(amostraId, { lat: p.lat, lng: p.lng, precisaoM: p.precisaoM, capturadoEm: p.capturadoEm });
    } catch (e) {
      setErroGps((e as Error).message);
    } finally {
      setCapturando(null);
    }
  }

  /** Cria um novo ponto e já captura a posição onde o usuário está. */
  async function adicionarPonto() {
    const proximo = (amostras!.at(-1)?.ponto ?? 0) + 1;
    setCapturando('novo');
    const id = await db.amostras.add({ coletaId, ponto: proximo, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null });
    await capturarGps(id);
  }

  async function excluir() {
    if (confirm('Excluir esta coleta e todas as suas amostras?')) {
      await excluirColeta(coletaId);
      navigate('/coletas');
    }
  }

  const fora = (a: Amostra) => (a.lat != null && a.lng != null ? dentroDoTalhao(a.lng, a.lat, talhao?.geometria) === false : false);
  const marcadores: Marcador[] = amostras
    .filter((a) => a.lat != null && a.lng != null)
    .map((a) => ({ lat: a.lat!, lng: a.lng!, rotulo: String(a.ponto), alerta: fora(a), titulo: fmtCoord(a.lat!, a.lng!) }));
  const nFora = amostras.filter(fora).length;
  const nSemGps = amostras.filter((a) => a.lat == null).length;

  return (
    <>
      <div className="titulo-linha">
        <h1>Coleta — {talhao ? nomeCurto(talhao.nome) : 'talhão removido'}</h1>
        <Link to="/coletas">← Coletas</Link>
      </div>

      <CabecalhoColeta coleta={coleta} talhoes={talhoes} />

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Pontos amostrados</h2>
          <button className="primario" onClick={adicionarPonto} disabled={capturando != null}>
            {capturando === 'novo' ? 'Lendo GPS…' : '📍 Novo ponto aqui'}
          </button>
        </div>
        <p className="dica">
          Em cada ponto, toque em <strong>Novo ponto aqui</strong>: o app grava a posição GPS e abre a linha para lançar o
          peso verde (massa cortada no quadro de {fmt(coleta.areaAmostralM2, 2)} m²) e, se houver, a subamostra de umidade (pesos
          úmido e seco já sem a tara).
        </p>
        {erroGps && <p className="aviso">{erroGps} — o ponto foi criado sem posição; use ↻ para tentar de novo.</p>}
        {nFora > 0 && <p className="aviso">{nFora} ponto(s) com GPS fora do contorno do talhão (marcados em vermelho). Confira o talhão da coleta.</p>}

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
                const temGps = a.lat != null && a.lng != null;
                return (
                  <tr key={a.id}>
                    <td><strong>{a.ponto}</strong></td>
                    <td>
                      {temGps ? (
                        <span className={fora(a) ? 'gps-fora' : 'gps-ok'} title={`${fmtCoord(a.lat!, a.lng!)}${a.capturadoEm ? ` · ${new Date(a.capturadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}>
                          {fora(a) ? '⚠ fora' : '✓'}{a.precisaoM != null && ` ±${a.precisaoM} m`}
                        </span>
                      ) : (
                        <span className="mudo">sem posição</span>
                      )}{' '}
                      <button
                        className="mini"
                        aria-label={`Capturar GPS do ponto ${a.ponto}`}
                        title={temGps ? 'Recapturar posição' : 'Capturar posição'}
                        disabled={capturando != null}
                        onClick={() => capturarGps(a.id!)}
                      >
                        {capturando === a.id ? '…' : temGps ? '↻' : '📍'}
                      </button>
                    </td>
                    <td className="n">
                      <CampoNumero valor={a.pesoVerdeKg} ariaLabel={`Peso verde ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id!, { pesoVerdeKg: v })} />
                    </td>
                    <td className="n">{fmt(producaoPonto(a, coleta.areaAmostralM2), 2)}</td>
                    <td className="n">
                      <CampoNumero valor={a.pesoUmidoG} ariaLabel={`Peso úmido ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id!, { pesoUmidoG: v })} />
                    </td>
                    <td className="n">
                      <CampoNumero valor={a.pesoSecoG} ariaLabel={`Peso seco ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id!, { pesoSecoG: v })} />
                    </td>
                    <td className={`n ${invalido ? 'erro' : ''}`}>{invalido ? 'seco > úmido' : fmt(ms)}</td>
                    <td className="n">{fmt(teorUmidade(a))}</td>
                    <td className="acoes-linha">
                      <button className="perigo" aria-label={`Remover ponto ${a.ponto}`} onClick={() => confirm(`Remover o ponto ${a.ponto}?`) && db.amostras.delete(a.id!)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

      <div className="acoes">
        <button className="perigo" onClick={excluir}>Excluir coleta</button>
      </div>
    </>
  );
}

function CabecalhoColeta({ coleta, talhoes }: { coleta: Coleta; talhoes: Talhao[] }) {
  const [form, setForm] = useState(coleta);
  useEffect(() => setForm(coleta), [coleta]);
  const salvar = (campos: Partial<Coleta>) => db.coletas.update(coleta.id!, campos);

  return (
    <div className="cartao grade-form">
      <label>
        Talhão
        <select value={form.talhaoId} onChange={(e) => salvar({ talhaoId: Number(e.target.value) })}>
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

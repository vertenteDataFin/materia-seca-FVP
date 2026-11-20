import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adicionarAmostra, atualizarAmostra, atualizarColeta, excluirAmostra, excluirColeta, useDados } from '../dados';
import type { Amostra, Coleta, Talhao } from '../tipos';
import { estimativaTalhao, lancarSeco, producaoPonto, resumoColeta, statusMS, teorMS, teorUmidade, UMIDO_PADRAO_G } from '../calc';
import { AvisoQuadro, CampoNumero, SeloMS, useCelular } from '../components';
import { capturarPosicao, dentroDoTalhao, fmtCoord, origemPosicao, ROTULO_ORIGEM } from '../geo';
import { Icone } from '../Icone';
import MapaTalhoes, { type Marcador } from '../MapaTalhoes';
import { fmt, fmtData } from '../util';
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
  const [editandoDados, setEditandoDados] = useState(false);
  // Coleta ainda sem pontos: já abre a edição (marcar no mapa ou pelo GPS)
  const [editandoPontos, setEditandoPontos] = useState(() => !!dados && !dados.amostras.some((a) => a.coletaId === coletaId));
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
      atualizarAmostra(amostraId, { lat: p.lat, lng: p.lng, precisaoM: p.precisaoM, capturadoEm: p.capturadoEm, origemPos: 'gps' });
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
    .map((a) => ({ lat: a.lat!, lng: a.lng!, rotulo: String(a.ponto), alerta: fora(a), origem: origemPosicao(a) ?? undefined, titulo: `${fmtCoord(a.lat!, a.lng!)} · ${ROTULO_ORIGEM[origemPosicao(a)!]}` }));
  const nFora = amostras.filter(fora).length;
  const nSemGps = amostras.filter((a) => a.lat == null).length;

  const statusGps = (a: Amostra) =>
    a.lat != null && a.lng != null ? (
      <span className={fora(a) ? 'gps-fora' : 'gps-ok'} title={`${fmtCoord(a.lat, a.lng)}${a.capturadoEm ? ` · ${new Date(a.capturadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}>
        {fora(a) ? <><Icone nome="alerta" /> fora</> : <Icone nome="ok" />} {origemPosicao(a) === 'gps' ? 'GPS' : 'mapa'}{a.precisaoM != null && ` ±${a.precisaoM} m`}
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
        {capturando === a.id ? '…' : <Icone nome={temGps ? 'atualizar' : 'gps'} />}
      </button>
    );
  };
  const botaoRemover = (a: Amostra) =>
    podeExcluir ? (
      <button className="perigo mini" aria-label={`Remover ponto ${a.ponto}`} title="Remover ponto" onClick={() => confirm(`Remover o ponto ${a.ponto}?`) && excluirAmostra(a.id)}><Icone nome="excluir" /></button>
    ) : null;

  const status = statusColeta(amostras);
  const ordenadas = [...amostras].sort((a, b) => a.ponto - b.ponto);
  const tMSponto = (a: Amostra) => {
    const kg = producaoPonto(a, coleta.areaAmostralM2);
    const ms = teorMS(a);
    return kg == null || ms == null ? null : (kg * 10 * ms) / 100;
  };

  return (
    <>
      <div className="titulo-linha">
        <h1>Coleta — {talhao ? talhao.nome : 'talhão removido'}</h1>
        <Link to="/coletas">← Coletas</Link>
      </div>

      <div className="cartao coleta-unica">
        {/* 1) Identificação da coleta */}
        <div className="coleta-ident">
          <dl>
            <div><dt>Talhão</dt><dd>{talhao ? talhao.nome : 'talhão removido'}{talhao?.capim ? <small className="mudo"> · {talhao.capim}</small> : null}</dd></div>
            <div><dt>Data da coleta</dt><dd>{fmtData(coleta.data)}</dd></div>
            <div><dt>Responsável</dt><dd>{coleta.responsavel || <span className="mudo">—</span>}</dd></div>
            <div><dt>Situação</dt><dd>{ROTULO_STATUS_COLETA[status]}</dd></div>
            {coleta.observacoes ? <div className="largo"><dt>Observações</dt><dd>{coleta.observacoes}</dd></div> : null}
          </dl>
          <button type="button" className="icone-acao" aria-expanded={editandoDados} aria-label="Editar talhão, data, responsável e observações" title="Editar dados da coleta" onClick={() => setEditandoDados((v) => !v)}>
            <Icone nome={editandoDados ? 'fechar' : 'editar'} />
          </button>
        </div>
        {editandoDados && <CabecalhoColeta coleta={coleta} talhoes={talhoes} />}

        {/* 2) Mapa dos pontos */}
        {!!talhao?.geometria?.length && (
          <section className="coleta-secao">
            <h2>Mapa dos pontos</h2>
            <MapaTalhoes talhoes={[talhao]} marcadores={marcadores} altura={celular ? 260 : 340} />
          </section>
        )}

        {/* 3) Resultados dos pontos */}
        <section className="coleta-secao">
          <div className="cabecalho-cartao">
            <h2>Resultados dos pontos</h2>
            <button type="button" className={editandoPontos ? 'primario' : ''} onClick={() => setEditandoPontos((v) => !v)}>
              {editandoPontos ? <><Icone nome="ok" /> Pronto</> : <><Icone nome="editar" /> Editar pontos</>}
            </button>
          </div>
          {nFora > 0 && <p className="aviso">{nFora} ponto(s) com GPS fora do contorno do talhão (marcados em vermelho). Confira o talhão da coleta.</p>}
          {!editandoPontos && (
            <>
              {!amostras.length ? (
                <p className="vazio">Nenhum ponto nesta coleta.</p>
              ) : (
                <div className="rolagem">
                  <table className="tabela-simples tabela-pontos">
                    <thead>
                      <tr>
                        <th>Ponto</th>
                        <th className="oculta-cel">Posição</th>
                        <th className="n">MV (kg/m²)</th>
                        <th className="n">t MV/ha</th>
                        <th className="n">MS %</th>
                        <th className="n">t MS/ha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenadas.map((a) => {
                        const kg = producaoPonto(a, coleta.areaAmostralM2);
                        const ms = teorMS(a);
                        return (
                          <tr key={a.id} className={fora(a) ? 'ponto-fora' : ''}>
                            <td><strong>{a.ponto}</strong> <code className="codigo oculta-cel">{codigoAmostra(talhao?.nome ?? '', coleta.data, a.ponto)}</code></td>
                            <td className="oculta-cel">{statusGps(a)}</td>
                            <td className="n">{kg == null ? <span className="mudo">a pesar</span> : fmt(kg, 2)}</td>
                            <td className="n">{kg == null ? '—' : fmt(kg * 10, 1)}</td>
                            <td className="n">{ms == null ? <span className="mudo">a aferir</span> : fmt(ms, 1)}</td>
                            <td className="n">{fmt(tMSponto(a), 1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td><strong>Média</strong></td>
                        <td className="oculta-cel mudo">{r.nPontos} pesado(s) · MS em {r.nPontosMS}</td>
                        <td className="n">{fmt(r.mvKgM2, 2)}</td>
                        <td className="n">{fmt(r.tMVha, 1)}</td>
                        <td className="n">{fmt(r.msPct, 1)}</td>
                        <td className="n">{fmt(r.tMSha, 1)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="coleta-resumo">
                <SeloMS status={statusMS(r.msPct, parametros)} />
                <span>CV entre pontos: <strong>{r.cvPct == null ? '—' : `${fmt(r.cvPct, 0)}%`}</strong></span>
                {r.umidadePct != null && <span>Umidade: <strong>{fmt(r.umidadePct, 1)}%</strong></span>}
                {talhao && est && est.tMVtotal != null && (
                  <span>
                    No talhão ({fmt(talhao.areaHa, 1)} ha): <strong>{fmt(est.tMVtotal, 0)} t MV</strong>
                    {est.tMStotal != null && <> · <strong>{fmt(est.tMStotal, 0)} t MS</strong></>}
                    {est.silagemT != null && <> · silagem {fmt(est.silagemT, 0)} t (−{fmt(parametros.perdasPct, 0)}%)</>}
                  </span>
                )}
              </p>
              {r.cvPct != null && r.cvPct > 25 && <p className="aviso">Variação alta entre pontos (CV &gt; 25%). Considere amostrar mais pontos para uma estimativa confiável.</p>}
            </>
          )}
        </section>

        {editandoPontos && (
          <div className="coleta-edicao">
        <div className="cabecalho-cartao">
          <h3>Editar pontos</h3>
          <span className="acoes-edicao">
            <Link className="botao" to={`/coletas/${coletaId}/pontos`}><Icone nome="mapa" /> Marcar no mapa</Link>
            <button className="primario" onClick={adicionarPonto} disabled={capturando != null}>
              {capturando === 'novo' ? 'Lendo GPS…' : <><Icone nome="gps" /> Novo ponto aqui</>}
            </button>
          </span>
        </div>
        <p className="dica">
          Peso verde = massa cortada no quadro de 1 m² (campo);
          o seco da subamostra de {UMIDO_PADRAO_G} g (já sem a tara) dá a MS e normalmente é lançado em <Link to={`/coletas?coleta=${coletaId}`}>Aguardando MS (Amostragem)</Link>, mas
          úmido e seco também podem ser editados aqui (o úmido fica em {UMIDO_PADRAO_G} g se não for informado). <strong>Novo ponto aqui</strong> cria um ponto na sua posição GPS.
        </p>
        {erroGps && <p className="aviso">{erroGps} — o ponto foi criado sem posição; use o botão <Icone nome="atualizar" titulo="atualizar posição" /> do ponto para tentar de novo.</p>}
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
                      <CampoNumero valor={a.pesoSecoG} ariaLabel={`Peso seco ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, lancarSeco(a, v))} />
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
                      <CampoNumero valor={a.pesoSecoG} ariaLabel={`Peso seco ponto ${a.ponto}`} aoSalvar={(v) => atualizarAmostra(a.id, lancarSeco(a, v))} />
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
    <div className="grade-form edicao-dados">
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
      <AvisoQuadro coleta={coleta} />
      <label className="largo">
        Observações
        <input value={form.observacoes ?? ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} onBlur={() => salvar({ observacoes: form.observacoes })} />
      </label>
    </div>
  );
}

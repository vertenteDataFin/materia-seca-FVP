import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, ultimaColetaPorTalhao, useDados } from '../dados';
import { estimativaTalhao, resumoColeta, statusMS } from '../calc';
import { Indicador, SeloMS } from '../components';
import { fmt, fmtData, lerParametros } from '../util';
import { nomeCurto } from '../MapaTalhoes';

export default function Painel() {
  const [parametros] = useState(lerParametros);
  const dados = useDados();

  const linhas = useMemo(() => {
    if (!dados) return [];
    const ultima = ultimaColetaPorTalhao(dados.coletas);
    const porColeta = amostrasPorColeta(dados.amostras);
    return dados.talhoes.map((t) => {
      const c = ultima.get(t.id);
      const r = c ? resumoColeta(c, porColeta.get(c.id) ?? []) : null;
      const e = r ? estimativaTalhao(t.areaHa, r, parametros) : null;
      return { t, c, r, e };
    });
  }, [dados, parametros]);

  if (!dados) return null;

  const soma = (f: (l: (typeof linhas)[number]) => number | null | undefined) =>
    linhas.reduce((s, l) => s + (f(l) ?? 0), 0);
  const areaTotal = soma((l) => l.t.areaHa);
  const mvTotal = soma((l) => l.e?.tMVtotal);
  const msTotal = soma((l) => l.e?.tMStotal);
  const silagemTotal = soma((l) => l.e?.silagemT);
  const volumeTotal = soma((l) => l.e?.volumeM3);
  // MS média ponderada apenas sobre talhões que têm MV e MS
  const mvComMS = soma((l) => (l.e?.tMStotal != null ? l.e.tMVtotal : 0));
  const msPonderada = mvComMS > 0 ? (msTotal / mvComMS) * 100 : null;

  if (!dados.talhoes.length) {
    return (
      <>
        <h1>Painel de produção</h1>
        <div className="cartao">
          <p className="vazio">
            Nenhum talhão cadastrado. <Link to="/talhoes">Ir para Talhões →</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Painel de produção</h1>
      <div className="cartao">
        <div className="indicadores">
          <Indicador rotulo="Área total" valor={fmt(areaTotal, 2)} unidade="ha" />
          <Indicador rotulo="Massa verde estimada" valor={fmt(mvTotal)} unidade="t" />
          <Indicador rotulo="Matéria seca estimada" valor={fmt(msTotal)} unidade="t" />
          <Indicador rotulo="MS média ponderada" valor={fmt(msPonderada)} unidade="%" />
          <Indicador rotulo="Silagem estimada" valor={fmt(silagemTotal)} unidade="t" />
          <Indicador rotulo="Volume de silo" valor={fmt(volumeTotal, 0)} unidade="m³" />
        </div>
        <p className="dica">
          Estimativas com base na coleta mais recente de cada talhão. Perdas: {fmt(parametros.perdasPct, 0)}% · Densidade:{' '}
          {fmt(parametros.densidadeKgM3, 0)} kg/m³ · Faixa ideal de MS: {fmt(parametros.msMin, 0)}–{fmt(parametros.msMax, 0)}% (
          <Link to="/config">alterar</Link>)
        </p>
      </div>

      <div className="cartao">
        <h2>Por talhão</h2>
        <p className="dica">Última coleta de cada talhão. Toque no talhão para ver o cadastro ou na data para abrir a coleta.</p>
        <div className="rolagem">
          <table className="tabela-cartoes">
            <thead>
              <tr>
                <th>Talhão</th>
                <th className="oculta-cel">Capim</th>
                <th className="oculta-cel">Última coleta</th>
                <th className="n">Amostras</th>
                <th className="n">MV (kg/m²)</th>
                <th className="n">MV (t/ha)</th>
                <th className="n">MS (%)</th>
                <th className="n">MS (t/ha)</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ t, c, r }) => (
                <tr key={t.id}>
                  <td className="nome-talhao largo-cel">
                    <Link to={`/talhoes?talhao=${t.id}`} title={t.nome}><strong>{nomeCurto(t.nome)}</strong></Link>
                    <div className="mudo so-cel">
                      <small>{t.capim || '—'}{c ? <> · <Link to={`/coletas/${c.id}`}>{fmtData(c.data)}</Link></> : ' · sem coleta'}</small>
                      {c && <> <SeloMS status={statusMS(r?.msPct ?? null, parametros)} /></>}
                    </div>
                  </td>
                  <td className="oculta-cel">{t.capim || '—'}</td>
                  <td className="oculta-cel">{c ? <Link to={`/coletas/${c.id}`}>{fmtData(c.data)}</Link> : <span className="mudo">sem coleta</span>}</td>
                  <td className="n" data-rotulo="Amostras">{r ? r.nPontos : '—'}</td>
                  <td className="n" data-rotulo="MV (kg/m²)">{fmt(r?.mvKgM2, 2)}</td>
                  <td className="n" data-rotulo="MV (t/ha)">{fmt(r?.tMVha)}</td>
                  <td className="n" data-rotulo="MS (%)">{fmt(r?.msPct)}</td>
                  <td className="n" data-rotulo="MS (t/ha)">{fmt(r?.tMSha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../Icone';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, atualizarAmostra, atualizarAmostraColheita, useDados } from '../dados';
import { aguardandoMSColheita } from '../amostragemColheita';
import { fmtSaida } from '../colheita';
import { compararColetasDesc, type Amostra, type Coleta, type Talhao } from '../tipos';
import { lancarSeco, resumoColeta, teorMS, UMIDO_PADRAO_G } from '../calc';
import { CampoNumero } from '../components';
import { codigoAmostra, pendenteLab, statusColeta } from '../fluxo';
import { fmt, fmtData } from '../util';

interface Grupo {
  c: Coleta;
  t: Talhao | undefined;
  amostras: Amostra[];
  pendentes: number;
}

/**
 * Fila do laboratório (topo da página Amostragem): coletas com o campo concluído e pontos ainda sem MS,
 * com o peso seco lançado ali mesmo. Some quando não há nada pendente.
 */
export function FilaMS({ destaque, destaqueColheita }: { destaque: string | null; destaqueColheita?: string | null }) {
  const dados = useDados();
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(destaque ? [destaque] : []));
  // Amostras de caminhão (amostragem de colheita) ainda sem o peso seco, da mais antiga para a mais nova.
  const colheita = useMemo(
    () => (dados ? dados.amostrasColheita.filter(aguardandoMSColheita).sort((a, b) => a.coletadaEm.localeCompare(b.coletadaEm)) : []),
    [dados],
  );

  const pendentes = useMemo(() => {
    if (!dados) return [] as Grupo[];
    const porColeta = amostrasPorColeta(dados.amostras);
    const talhoes = new Map(dados.talhoes.map((t) => [t.id, t]));
    return [...dados.coletas]
      .sort(compararColetasDesc)
      .map((c) => {
        const amostras = porColeta.get(c.id) ?? [];
        return { c, t: talhoes.get(c.talhaoId), amostras, pendentes: amostras.filter(pendenteLab).length };
      })
      // Só entram na fila coletas com o campo concluído (todos os pontos com peso verde).
      .filter((g) => statusColeta(g.amostras) === 'laboratorio');
  }, [dados]);

  useEffect(() => {
    if (!destaque) return;
    setAbertos((s) => (s.has(destaque) ? s : new Set([...s, destaque])));
    document.getElementById(`lab-${destaque}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [destaque, dados != null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (destaqueColheita) document.getElementById(`ac-${destaqueColheita}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [destaqueColheita, dados != null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dados || (!pendentes.length && !colheita.length)) return null;
  const nomeTalhao = (id: string) => dados.talhoes.find((t) => t.id === id)?.nome ?? 'talhão removido';
  const alternar = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const total = pendentes.reduce((s, g) => s + g.pendentes, 0) + colheita.length;

  return (
    <div className="cartao fila-ms">
      <div className="cabecalho-cartao">
        <h2>Aguardando MS</h2>
        <span className="selo selo-alto">{total} amostra{total === 1 ? '' : 's'}</span>
      </div>
      <p className="dica">
        Pese <strong>{UMIDO_PADRAO_G} g</strong> da subamostra úmida e lance o peso <strong>seco</strong> (g, sem a tara): o seco em gramas já é a MS em %.
        Confira o código da etiqueta do saco. A coleta sai daqui quando todos os pontos estiverem aferidos; a amostra do caminhão, quando o seco for lançado.
      </p>
      {pendentes.map((g) => (
        <GrupoLab key={g.c.id} g={g} aberto={abertos.has(g.c.id) || (pendentes.length === 1 && !colheita.length)} alternar={() => alternar(g.c.id)} />
      ))}
      {colheita.length > 0 && (
        <div className="lab-grupo">
          <div className="lab-cabecalho estatico">
            <Icone nome="caminhao" />
            <strong>Amostragem de colheita</strong>
            <span className="espaco" />
            <span className="selo selo-alto">{colheita.length} sem MS</span>
          </div>
          <div className="lab-linhas">
            <div className="lab-linha lab-titulo">
              <span>Caminhão</span>
              <span>Silo</span>
              <span>Seco (g) de {UMIDO_PADRAO_G} g</span>
              <span className="n">MS %</span>
            </div>
            {colheita.map((a) => (
              <div key={a.id} id={`ac-${a.id}`} className={`lab-linha pendente${a.id === destaqueColheita ? ' destaque' : ''}`}>
                <span>
                  {a.codigo && <><code className="codigo">{a.codigo}</code> </>}
                  <strong>{a.placa}</strong> <span className="mudo"><small>{nomeTalhao(a.talhaoId)} · {fmtSaida(a.coletadaEm)}</small></span>
                </span>
                <span className="mv" data-rotulo="Silo">{a.silo}</span>
                <CampoNumero
                  valor={a.pesoSecoG}
                  ariaLabel={`Peso seco da amostra do caminhão ${a.placa}`}
                  placeholder="seco (g)"
                  aoSalvar={(v) => atualizarAmostraColheita(a.id, lancarSeco(a, v))}
                />
                <span className="n ms oculta-cel" data-rotulo="MS %">—</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GrupoLab({ g, aberto, alternar }: { g: Grupo; aberto: boolean; alternar: () => void }) {
  const { c, t, amostras } = g;
  const r = resumoColeta(c, amostras);
  const nome = t?.nome ?? 'talhão removido';
  return (
    <div className="lab-grupo" id={`lab-${c.id}`}>
      <button className="lab-cabecalho" onClick={alternar} aria-expanded={aberto}>
        <span className="lab-seta" aria-hidden><Icone nome={aberto ? 'expandir' : 'recolher'} /></span>
        <strong>{nome}</strong>
        <span className="mudo">{fmtData(c.data)}{c.responsavel ? ` · ${c.responsavel}` : ''}</span>
        <span className="espaco" />
        {g.pendentes ? <span className="selo selo-alto">{g.pendentes} de {amostras.length} sem MS</span> : <span className="selo selo-ideal">MS {fmt(r.msPct)} %</span>}
      </button>
      {aberto && (
        <>
          <div className="lab-linhas">
            <div className="lab-linha lab-titulo">
              <span>Amostra</span>
              <span className="n">MV total (kg)</span>
              <span>Seco (g) de {UMIDO_PADRAO_G} g</span>
              <span className="n">MS %</span>
            </div>
            {amostras.map((a) => {
              const ms = teorMS(a);
              const invalido = a.pesoUmidoG != null && a.pesoSecoG != null && ms == null;
              // Amostra antiga pesada com outro úmido: avisa, porque aí o seco não é a MS direto.
              const umidoDiferente = a.pesoUmidoG != null && a.pesoUmidoG !== UMIDO_PADRAO_G;
              return (
                <div key={a.id} className={`lab-linha ${pendenteLab(a) ? 'pendente' : ''}`}>
                  <span>
                    <strong>P{a.ponto}</strong> <code className="codigo">{codigoAmostra(nome, c.data, a.ponto)}</code>
                  </span>
                  <span className="n mv" data-rotulo="MV total (kg)">{fmt(a.pesoVerdeKg, 2)}</span>
                  <CampoNumero valor={a.pesoSecoG} ariaLabel={`Peso seco ponto ${a.ponto}`} placeholder="seco (g)" aoSalvar={(v) => atualizarAmostra(a.id, lancarSeco(a, v))} />
                  <span className={`n ms ${invalido ? 'erro' : ''}`} data-rotulo="MS %">
                    {invalido ? 'seco > úmido' : ms == null ? '—' : fmt(ms)}
                    {umidoDiferente && <small className="mudo"> (úmido {fmt(a.pesoUmidoG, 0)} g)</small>}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="acoes" style={{ marginTop: '0.5rem' }}>
            <Link className="botao" to={`/coletas/${c.id}`}>Ver resultado da coleta</Link>
          </div>
        </>
      )}
    </div>
  );
}

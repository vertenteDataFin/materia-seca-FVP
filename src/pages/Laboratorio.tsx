import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../Icone';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, atualizarAmostra, useDados } from '../dados';
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
export function FilaMS({ destaque }: { destaque: string | null }) {
  const dados = useDados();
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(destaque ? [destaque] : []));

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

  if (!dados || !pendentes.length) return null;
  const alternar = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const total = pendentes.reduce((s, g) => s + g.pendentes, 0);

  return (
    <div className="cartao fila-ms">
      <div className="cabecalho-cartao">
        <h2>Aguardando MS</h2>
        <span className="selo selo-alto">{total} amostra{total === 1 ? '' : 's'}</span>
      </div>
      <p className="dica">
        Pese <strong>{UMIDO_PADRAO_G} g</strong> da subamostra úmida e lance o peso <strong>seco</strong> (g, sem a tara): o seco em gramas já é a MS em %.
        Confira o código da etiqueta do saco. A coleta sai daqui quando todos os pontos estiverem aferidos.
      </p>
      {pendentes.map((g) => (
        <GrupoLab key={g.c.id} g={g} aberto={abertos.has(g.c.id) || pendentes.length === 1} alternar={() => alternar(g.c.id)} />
      ))}
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

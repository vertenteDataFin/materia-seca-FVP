import { Fragment, useState } from 'react';
import { atualizarAmostraColheita, excluirAmostraColheita, useDados } from '../dados';
import { msColheita, PENEIRAS, pennState } from '../amostragemColheita';
import { lancarSeco, UMIDO_PADRAO_G } from '../calc';
import { fmtSaida } from '../colheita';
import { CampoNumero } from '../components';
import { usePermissoes } from '../permissoes';
import { fmt } from '../util';
import type { AmostraColheita } from '../tipos';

const LIMITE = 80;

/**
 * Amostragem de colheita (caminhões): talhão, caminhão, silo, MS e Penn State de cada amostra.
 * Toque numa linha para completar ou corrigir os pesos.
 */
export default function AmostrasColheitaCard({ destaque }: { destaque: string | null }) {
  const dados = useDados();
  const { podeExcluir } = usePermissoes();
  const [aberta, setAberta] = useState<string | null>(null);
  if (!dados || !dados.amostrasColheita.length) return null;
  const nomes = new Map(dados.talhoes.map((t) => [t.id, t.nome]));
  const lista = dados.amostrasColheita.slice(0, LIMITE);

  return (
    <div className="cartao amostras-colheita">
      <div className="cabecalho-cartao">
        <h2>Amostragem de colheita</h2>
        <span className="mudo">{dados.amostrasColheita.length}</span>
      </div>
      <p className="dica">Amostras dos caminhões. Penn State: % retida nas peneiras de 19, 8 e 4 mm e no fundo. Toque numa amostra para corrigir.</p>
      <div className="rolagem">
        <table className="tabela-cartoes tabela-amostras-colheita">
          <thead>
            <tr>
              <th>Amostra</th>
              <th className="oculta-cel">Talhão</th>
              <th className="oculta-cel">Silo</th>
              <th className="n">MS %</th>
              <th className="n col-penn">Penn State % <small className="mudo">(19 · 8 · 4 · F)</small></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const ms = msColheita(a);
              const ps = pennState(a);
              const talhao = nomes.get(a.talhaoId) ?? 'talhão removido';
              const alternar = () => setAberta(aberta === a.id ? null : a.id);
              return (
                <Fragment key={a.id}>
                  <tr
                    className={`clicavel${a.id === destaque ? ' linha-sel' : ''}`}
                    tabIndex={0}
                    aria-expanded={aberta === a.id}
                    onClick={alternar}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } }}
                  >
                    <td className="nome-talhao largo-cel">
                      <strong>{a.placa}</strong> <span className="mudo"><small>{fmtSaida(a.coletadaEm)}</small></span>
                      <div className="mudo so-cel"><small>{talhao} → {a.silo}</small></div>
                    </td>
                    <td className="oculta-cel">{talhao}</td>
                    <td className="oculta-cel">{a.silo}</td>
                    <td className="n" data-rotulo="MS %">{ms == null ? <span className="mudo">aguardando</span> : fmt(ms)}</td>
                    <td className="n col-penn" data-rotulo="Penn State % (19·8·4·F)">
                      {ps ? ps.pct.map((p) => fmt(p, 0)).join(' · ') : <span className="mudo">—</span>}
                    </td>
                  </tr>
                  {aberta === a.id && (
                    <tr className="linha-edicao-amostra">
                      <td colSpan={5}>
                        <EdicaoAmostra a={a} talhao={talhao} podeExcluir={podeExcluir} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {dados.amostrasColheita.length > LIMITE && <p className="dica">Mostrando as {LIMITE} mais recentes.</p>}
    </div>
  );
}

function EdicaoAmostra({ a, talhao, podeExcluir }: { a: AmostraColheita; talhao: string; podeExcluir: boolean }) {
  const ps = pennState(a);
  return (
    <div className="edicao-amostra-colheita">
      <p className="mudo">
        <small>
          {talhao} → {a.silo} · {a.placa}
          {a.motorista ? ` (${a.motorista})` : ''}
          {a.responsavel ? ` · amostrada por ${a.responsavel}` : ''}
          {a.observacoes ? ` · ${a.observacoes}` : ''}
        </small>
      </p>
      <div className="peneiras">
        {PENEIRAS.map((pen, i) => (
          <label key={pen.campo}>
            {pen.rotulo} (g)
            <CampoNumero valor={a[pen.campo]} ariaLabel={`Peneira ${pen.rotulo}`} aoSalvar={(v) => atualizarAmostraColheita(a.id, { [pen.campo]: v })} />
            <small className="mudo pct-peneira">{ps ? `${fmt(ps.pct[i], 1)}%` : '—'}</small>
          </label>
        ))}
        <label>
          Seco (g) de {UMIDO_PADRAO_G} g
          <CampoNumero valor={a.pesoSecoG} ariaLabel="Peso seco" placeholder="seco (g)" aoSalvar={(v) => atualizarAmostraColheita(a.id, lancarSeco(a, v))} />
          <small className="mudo">MS {fmt(msColheita(a))} %</small>
        </label>
      </div>
      {podeExcluir && (
        <div className="acoes">
          <button
            type="button"
            className="perigo"
            onClick={() => confirm(`Excluir a amostra do caminhão ${a.placa} (${fmtSaida(a.coletadaEm)})?`) && excluirAmostraColheita(a.id)}
          >
            Excluir amostra
          </button>
        </div>
      )}
    </div>
  );
}

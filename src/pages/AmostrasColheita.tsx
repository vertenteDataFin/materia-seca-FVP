import { Fragment, useState } from 'react';
import { atualizarAmostraColheita, excluirAmostraColheita, useDados } from '../dados';
import { msColheita, PENEIRAS, pennState } from '../amostragemColheita';
import { lancarSeco, UMIDO_PADRAO_G } from '../calc';
import { fmtSaida } from '../colheita';
import { CampoNumero } from '../components';
import { usePermissoes } from '../permissoes';
import { fmt } from '../util';
import type { AmostraColheita } from '../tipos';
import { faltaPeFdn, peFdnDaAmostra, rotuloPeFdn, textoFonteFdn, textoPeFdn, useConfigFdn } from '../fdn';
import { LegendaPenn, PctPeneira, PercentuaisPenn } from '../PennState';
import { compartilharOuBaixarImagem, gerarImagemAmostra } from '../imagemAmostraColheita';
import { veiculoDaPlaca } from '../veiculos';

const LIMITE = 80;

/**
 * Amostragem de colheita (caminhões): talhão, caminhão, silo, MS e Penn State de cada amostra.
 * Toque numa linha para completar ou corrigir os pesos.
 */
export default function AmostrasColheitaCard({ destaque }: { destaque: string | null }) {
  const dados = useDados();
  const { podeExcluir } = usePermissoes();
  const cfgFdn = useConfigFdn();
  const [aberta, setAberta] = useState<string | null>(null);
  if (!dados || !dados.amostrasColheita.length) return null;
  const nomes = new Map(dados.talhoes.map((t) => [t.id, t.nome]));
  const capins = new Map(dados.talhoes.map((t) => [t.id, t.capim]));
  const lista = dados.amostrasColheita.slice(0, LIMITE);

  return (
    <div className="cartao amostras-colheita">
      <div className="cabecalho-cartao">
        <h2>Amostragem de colheita</h2>
        <span className="mudo">{dados.amostrasColheita.length}</span>
      </div>
      <p className="dica">
        <LegendaPenn />
      </p>
      <div className="rolagem">
        <table className="tabela-cartoes tabela-amostras-colheita">
          <thead>
            <tr>
              <th>Amostra</th>
              <th className="oculta-cel">Talhão</th>
              <th className="oculta-cel">Silo</th>
              <th className="n">MS %</th>
              <th className="n col-penn">Penn State % <small className="mudo">(19 · 8 · 4 · F)</small></th>
              <th className="n th-fdnfe">{rotuloPeFdn(cfgFdn.pef)} <small className="mudo">(% MS)</small></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const ms = msColheita(a);
              const ps = pennState(a);
              const talhao = nomes.get(a.talhaoId) ?? 'talhão removido';
              const peR = peFdnDaAmostra(a, capins.get(a.talhaoId) ?? '', cfgFdn);
              const pe = { r: peR, texto: textoPeFdn(peR, cfgFdn.pef) };
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
                      <strong>{a.codigo ?? a.placa}</strong> <span className="mudo"><small>{fmtSaida(a.coletadaEm)}</small></span>
                      <div className="mudo"><small>{a.codigo ? `${a.placa}` : ''}<span className="so-cel">{a.codigo ? ' · ' : ''}{talhao} → {a.silo}</span></small></div>
                    </td>
                    <td className="oculta-cel">{talhao}</td>
                    <td className="oculta-cel">{a.silo}</td>
                    <td className="n" data-rotulo="MS %">{ms == null ? <span className="mudo">aguardando</span> : fmt(ms)}</td>
                    <td className="n col-penn" data-rotulo="Penn State % (19·8·4·F)">
                      {ps ? <PercentuaisPenn pct={ps.pct} /> : <span className="mudo">—</span>}
                    </td>
                    <td className="n peFdn-celula" data-rotulo={rotuloPeFdn(cfgFdn.pef)}>
                      {pe.texto ?? <span className="mudo">—</span>}
                      {pe.texto && pe.r.fonte === 'laboratorio' && <small className="mudo">FDN lab</small>}
                    </td>
                  </tr>
                  {aberta === a.id && (
                    <tr className="linha-edicao-amostra">
                      <td colSpan={6}>
                        <EdicaoAmostra a={a} talhao={talhao} podeExcluir={podeExcluir} capim={capins.get(a.talhaoId) ?? ''} />
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

function EdicaoAmostra({ a, talhao, podeExcluir, capim }: { a: AmostraColheita; talhao: string; podeExcluir: boolean; capim: string }) {
  const ps = pennState(a);
  const cfgFdn = useConfigFdn();
  const dados = useDados();
  const pe = peFdnDaAmostra(a, capim, cfgFdn);
  const pct = (v: number | null) => (v == null ? '—' : `${fmt(v * 100, 1)}%`);
  const [gerando, setGerando] = useState(false);
  async function exportarImagem() {
    setGerando(true);
    try {
      const blob = await gerarImagemAmostra({ amostra: a, talhao, capim, pe, pef: cfgFdn.pef, numeroCaminhao: veiculoDaPlaca(dados?.veiculos ?? [], a.placa)?.numero ?? null });
      const nome = `coleta-${(a.codigo ?? a.placa).replace(/[^\w-]+/g, '_')}.png`;
      await compartilharOuBaixarImagem(blob, nome, `Amostra ${a.codigo ?? a.placa}`);
    } catch (e) {
      alert(`Não deu para gerar a imagem: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  }
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
            <PctPeneira i={i} pct={ps ? ps.pct[i] : null} />
          </label>
        ))}
        <label>
          Seco (g) de {UMIDO_PADRAO_G} g
          <CampoNumero valor={a.pesoSecoG} ariaLabel="Peso seco" placeholder="seco (g)" aoSalvar={(v) => atualizarAmostraColheita(a.id, lancarSeco(a, v))} />
          <small className="mudo">MS {fmt(msColheita(a))} %</small>
        </label>
        <label>
          FDN lab. (% MS)
          {/* Em branco vale a FDN de referência, que aparece em cinza dentro do campo */}
          <CampoNumero
            valor={a.fdnPct ?? null}
            ariaLabel="FDN do laboratório"
            placeholder={a.fdnPct == null && pe.fdnPct != null ? fmt(pe.fdnPct, 1) : '—'}
            aoSalvar={(v) => atualizarAmostraColheita(a.id, { fdnPct: v })}
          />
          <small className="mudo">{a.fdnPct != null ? 'do laboratório' : pe.fdnPct != null ? `em branco: ${textoFonteFdn(pe, capim)}` : 'sem FDN de referência'}</small>
        </label>
      </div>
      <p className="resumo-pefdn">
        <strong>FDNfe:</strong>{' '}
        {pe.peFdn4 == null ? (
          <span className="mudo">não calculada: {faltaPeFdn(pe)}.</span>
        ) : (
          <>
            FDN {fmt(pe.fdnPct, 1)}% ({textoFonteFdn(pe, capim)}) ·{' '}
            {cfgFdn.pef !== '4' && <>&gt; 8 mm {pct(pe.pef8)} → <strong>FDNfe {fmt(pe.peFdn8, 1)}%</strong></>}
            {cfgFdn.pef === 'ambos' && ' · '}
            {cfgFdn.pef !== '8' && <>&gt; 4 mm {pct(pe.pef4)} → <strong>FDNfe {fmt(pe.peFdn4, 1)}%</strong></>}
            <span className="mudo"> da MS</span>
          </>
        )}
      </p>
      <div className="acoes">
        <button type="button" className="primario" disabled={gerando} onClick={exportarImagem}>
          {gerando ? 'Gerando print…' : 'Compartilhar print da coleta'}
        </button>
        {podeExcluir && (
          <button
            type="button"
            className="perigo"
            onClick={() => confirm(`Excluir a amostra ${a.codigo ?? ''} do caminhão ${a.placa} (${fmtSaida(a.coletadaEm)})?`) && excluirAmostraColheita(a.id)}
          >
            Excluir amostra
          </button>
        )}
      </div>
    </div>
  );
}

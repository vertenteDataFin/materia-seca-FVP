import { Fragment, useState } from 'react';
import { atualizarAmostraMilho, excluirAmostraMilho, useDados } from '../dados';
import { granulometriaMilho, lancarSecoMilho, msMilho, PENEIRAS_MILHO, UMIDO_PADRAO_MILHO_G } from '../milhoReidratado';
import { fmtSaida } from '../colheita';
import { CampoNumero } from '../components';
import { usePermissoes } from '../permissoes';
import { fmt } from '../util';
import type { AmostraMilho } from '../tipos';
import { LegendaMilho, MetasMilho, PctPeneiraMilho } from '../MetasMilho';
import { gerarImagemAmostraMilho } from '../imagemAmostraMilho';
import { compartilharOuBaixarImagem } from '../imagemAmostraColheita';
import { BotaoFoto, MiniaturasFotos, type FotoPrint } from '../FotosAmostraMilho';

/** Fotos no print: até 4 (com mais, o print fica comprido demais). */
const MAX_FOTOS = 4;

const LIMITE = 40;

/** Milho reidratado: silo, MS e granulometria de cada amostra. Toque numa linha para completar ou corrigir. */
export default function AmostrasMilhoCard({ destaque }: { destaque: string | null }) {
  const dados = useDados();
  const { podeExcluir } = usePermissoes();
  const [aberta, setAberta] = useState<string | null>(destaque);
  if (!dados || !dados.amostrasMilho.length) return null;
  const lista = dados.amostrasMilho.slice(0, LIMITE);

  return (
    <div className="cartao amostras-colheita">
      <div className="cabecalho-cartao">
        <h2>Milho reidratado</h2>
        <span className="mudo">{dados.amostrasMilho.length}</span>
      </div>
      <p className="dica"><LegendaMilho /></p>
      <div className="rolagem">
        <table className="tabela-cartoes tabela-amostras-colheita">
          <thead>
            <tr>
              <th>Amostra</th>
              <th className="oculta-cel">Silo</th>
              <th className="n">MS %</th>
              <th className="n col-penn">Metas <small className="mudo">(6 · 3,25+2 · 1,25+F)</small></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const ms = msMilho(a);
              const g = granulometriaMilho(a);
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
                      <strong>{a.codigo ?? a.silo}</strong> <span className="mudo"><small>{fmtSaida(a.coletadaEm)}</small></span>
                      <div className="mudo so-cel"><small>{a.silo}</small></div>
                    </td>
                    <td className="oculta-cel">{a.silo}</td>
                    <td className="n" data-rotulo="MS %">{ms == null ? <span className="mudo">aguardando</span> : fmt(ms)}</td>
                    <td className="n col-penn" data-rotulo="Metas">{g ? <MetasMilho g={g} /> : <span className="mudo">—</span>}</td>
                  </tr>
                  {aberta === a.id && (
                    <tr className="linha-edicao-amostra">
                      <td colSpan={4}>
                        <EdicaoAmostraMilho a={a} podeExcluir={podeExcluir} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {dados.amostrasMilho.length > LIMITE && <p className="dica">Mostrando as {LIMITE} mais recentes.</p>}
    </div>
  );
}

function EdicaoAmostraMilho({ a, podeExcluir }: { a: AmostraMilho; podeExcluir: boolean }) {
  const g = granulometriaMilho(a);
  const [gerando, setGerando] = useState(false);
  // Fotos só para o print: não são gravadas; somem ao fechar a amostra.
  const [fotos, setFotos] = useState<FotoPrint[]>([]);
  function tirarFoto(id: string) {
    const f = fotos.find((x) => x.id === id);
    if (f) URL.revokeObjectURL(f.url);
    setFotos(fotos.filter((x) => x.id !== id));
  }
  async function exportarImagem() {
    setGerando(true);
    try {
      const blob = await gerarImagemAmostraMilho(a, fotos.map((f) => f.imagem));
      const nome = `milho-${(a.codigo ?? a.silo).replace(/[^\w-]+/g, '_')}.png`;
      await compartilharOuBaixarImagem(blob, nome, `Milho reidratado ${a.codigo ?? a.silo}`);
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
          {a.silo}
          {a.responsavel ? ` · amostrada por ${a.responsavel}` : ''}
          {a.observacoes ? ` · ${a.observacoes}` : ''}
        </small>
      </p>
      <div className="peneiras">
        {PENEIRAS_MILHO.map((pen, i) => (
          <label key={pen.campo}>
            {pen.rotulo} (g)
            <CampoNumero valor={a[pen.campo]} ariaLabel={`Peneira ${pen.rotulo}`} aoSalvar={(v) => atualizarAmostraMilho(a.id, { [pen.campo]: v })} />
            <PctPeneiraMilho i={i} pct={g ? g.pct[i] : null} />
          </label>
        ))}
        <label>
          Seco (g) de {a.pesoUmidoG ?? UMIDO_PADRAO_MILHO_G} g
          <CampoNumero valor={a.pesoSecoG} ariaLabel="Peso seco" placeholder="seco (g)" aoSalvar={(v) => atualizarAmostraMilho(a.id, lancarSecoMilho(a, v))} />
          <small className="mudo">MS {fmt(msMilho(a))} %</small>
        </label>
      </div>
      {g && <p className="resumo-pefdn"><strong>Metas:</strong> <MetasMilho g={g} /></p>}
      <MiniaturasFotos fotos={fotos} aoTirar={tirarFoto} />
      <div className="acoes">
        {fotos.length < MAX_FOTOS && <BotaoFoto aoEscolher={(novas) => setFotos((atuais) => [...atuais, ...novas].slice(0, MAX_FOTOS))} />}
        <button type="button" className="primario" disabled={gerando} onClick={exportarImagem}>
          {gerando ? 'Gerando relatório…' : 'Compartilhar relatório'}
        </button>
        {podeExcluir && (
          <button
            type="button"
            className="perigo"
            onClick={() => confirm(`Excluir a amostra ${a.codigo ?? ''} de milho reidratado (${a.silo}, ${fmtSaida(a.coletadaEm)})?`) && excluirAmostraMilho(a.id)}
          >
            Excluir amostra
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useDados } from './dados';
import { chaveCapim, salvarConfigFdn, useConfigFdn, type FaixaPef } from './fdn';
import { usePermissoes } from './permissoes';
import { FIREBASE_ATIVO } from './firebase';
import { numParaTexto, parseNum } from './util';

const OPCOES_PEF: { valor: FaixaPef; rotulo: string; ajuda: string }[] = [
  { valor: '4', rotulo: 'pef > 4 mm', ajuda: 'Peneiras de 19, 8 e 4 mm (tudo menos o fundo).' },
  { valor: '8', rotulo: 'pef > 8 mm', ajuda: 'Só as peneiras de 19 e 8 mm (fibra longa).' },
  { valor: 'ambos', rotulo: 'Os dois', ajuda: 'Mostra FDNfe > 8 mm e > 4 mm lado a lado.' },
];

/**
 * Config → FDN efetiva: qual fator do Penn State usar e a FDN de referência de cada capim.
 * Vale para todos; só administradores alteram.
 */
export default function FdnCard({ email }: { email: string }) {
  const dados = useDados();
  const cfg = useConfigFdn();
  const { admin } = usePermissoes();
  const podeEditar = admin || !FIREBASE_ATIVO;
  const [pef, setPef] = useState<FaixaPef>(cfg.pef);
  const [padrao, setPadrao] = useState(cfg.fdnPadrao != null ? numParaTexto(cfg.fdnPadrao) : '');
  const [texto, setTexto] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState('');

  // Capins dos talhões (mais os que já têm FDN cadastrada), em ordem alfabética
  const capins = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of dados?.talhoes ?? []) if (t.capim?.trim()) m.set(chaveCapim(t.capim), t.capim.trim());
    for (const k of Object.keys(cfg.fdnPorCapim)) if (!m.has(k)) m.set(k, k);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [dados, cfg]);

  // Configuração mudada em outro aparelho atualiza o formulário
  useEffect(() => {
    setPef(cfg.pef);
    setPadrao(cfg.fdnPadrao != null ? numParaTexto(cfg.fdnPadrao) : '');
    setTexto(Object.fromEntries(Object.entries(cfg.fdnPorCapim).map(([k, v]) => [k, numParaTexto(v)])));
  }, [cfg]);

  async function salvar() {
    const fdnPorCapim: Record<string, number> = {};
    for (const [k, nome] of capins) {
      const s = (texto[k] ?? '').trim();
      if (!s) continue;
      const v = parseNum(s);
      if (v == null || v <= 0 || v >= 100) return setMensagem(`FDN inválida para ${nome}: use um valor entre 0 e 100 (% da MS).`);
      fdnPorCapim[k] = v;
    }
    let fdnPadrao: number | null = null;
    if (padrao.trim()) {
      fdnPadrao = parseNum(padrao);
      if (fdnPadrao == null || fdnPadrao <= 0 || fdnPadrao >= 100) return setMensagem('FDN padrão inválida: use um valor entre 0 e 100 (% da MS).');
    }
    try {
      await salvarConfigFdn({ pef, fdnPadrao, fdnPorCapim }, email);
      setMensagem(FIREBASE_ATIVO ? 'Configuração da FDN efetiva salva para todos.' : 'Configuração salva.');
    } catch (e) {
      setMensagem(`Falha ao salvar: ${(e as Error).message}`);
    }
  }

  return (
    <div className="cartao config-fdn">
      <h2>FDN efetiva — FDNfe (amostragem de colheita)</h2>
      <p className="dica">
        FDNfe = fator do Penn State × FDN (% da MS). Com o fator &gt; 4 mm e FDN 71%, é a mesma fórmula da planilha da colheita:
        (&gt;19 + 8–19 + 4–8 mm) ÷ total × 0,71. A FDN usada é, nesta ordem: a do laboratório (informada na amostra), a do capim (abaixo)
        ou a FDN padrão. {!podeEditar && 'Só administradores alteram.'}
      </p>
      <fieldset className="opcoes-pef" disabled={!podeEditar}>
        <legend>Fator de efetividade física</legend>
        {OPCOES_PEF.map((o) => (
          <label key={o.valor} className="opcao-check">
            <input type="radio" name="pef" checked={pef === o.valor} onChange={() => setPef(o.valor)} />
            <span><strong>{o.rotulo}</strong> <small className="mudo">{o.ajuda}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="fdn-capins">
        <label>
          FDN padrão (% da MS)
          <input inputMode="decimal" value={padrao} placeholder="71" disabled={!podeEditar} onChange={(e) => setPadrao(e.target.value)} />
          <small className="mudo">Vale para todos os capins sem FDN própria.</small>
        </label>
      </div>
      <h3>FDN por capim (% da MS) <small className="mudo">— opcional, vale por cima da padrão</small></h3>
      {!capins.length ? (
        <p className="vazio">Nenhum capim cadastrado nos talhões.</p>
      ) : (
        <div className="fdn-capins">
          {capins.map(([k, nome]) => (
            <label key={k}>
              {nome}
              <input inputMode="decimal" value={texto[k] ?? ''} placeholder={padrao ? `padrão (${padrao})` : '—'} disabled={!podeEditar} onChange={(e) => setTexto({ ...texto, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      {podeEditar && (
        <div className="acoes">
          <button type="button" className="primario" onClick={salvar}>Salvar FDN efetiva</button>
        </div>
      )}
      {mensagem && <p className="aviso">{mensagem}</p>}
    </div>
  );
}

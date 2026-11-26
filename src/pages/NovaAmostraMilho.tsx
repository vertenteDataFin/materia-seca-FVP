import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SILOS } from '../silos';
import { adicionarAmostraMilho, useDados } from '../dados';
import { agoraLocal } from '../colheita';
import { usePermissoes } from '../permissoes';
import { granulometriaMilho, msMilho, PENEIRAS_MILHO, proximoCodigoMilho, UMIDO_PADRAO_MILHO_G, type CampoPeneiraMilho } from '../milhoReidratado';
import { MetasMilho, PctPeneiraMilho } from '../MetasMilho';
import { fmt, parseNum } from '../util';

const CHAVE_SILO = 'silagem-ms:amostra-milho-silo';
const CHAVE_RESPONSAVEL = 'silagem-ms:amostra-colheita-responsavel';

function lembrar(chave: string): string {
  try {
    return localStorage.getItem(chave) ?? '';
  } catch {
    return '';
  }
}

function guardar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

const PESOS_VAZIOS: Record<CampoPeneiraMilho, string> = { peneira6G: '', peneira325G: '', peneira2G: '', peneira125G: '', fundoG: '' };

/** Amostra de silagem de milho reidratado: silo, granulometria (5 peneiras, em g) e MS (pode ficar para depois). */
export default function NovaAmostraMilho() {
  const dados = useDados();
  const navigate = useNavigate();
  const { nomeUsuario } = usePermissoes();
  const [coletadaEm, setColetadaEm] = useState(agoraLocal());
  const [silo, setSilo] = useState(lembrar(CHAVE_SILO));
  const [responsavel, setResponsavel] = useState(nomeUsuario.trim() || lembrar(CHAVE_RESPONSAVEL));
  const [pesos, setPesos] = useState(PESOS_VAZIOS);
  const [umido, setUmido] = useState(String(UMIDO_PADRAO_MILHO_G));
  const [seco, setSeco] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');

  if (!dados) return null;
  const numeros = Object.fromEntries(PENEIRAS_MILHO.map((p) => [p.campo, parseNum(pesos[p.campo])])) as Record<CampoPeneiraMilho, number | null>;
  const g = granulometriaMilho(numeros);
  const codigo = proximoCodigoMilho(coletadaEm, dados.amostrasMilho);
  const umidoG = parseNum(umido);
  const secoG = parseNum(seco);
  const ms = secoG != null ? msMilho({ pesoUmidoG: umidoG, pesoSecoG: secoG }) : null;

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!silo.trim()) return setErro('Informe o silo.');
    for (const pen of PENEIRAS_MILHO) {
      if (pesos[pen.campo].trim() && (numeros[pen.campo] == null || numeros[pen.campo]! < 0)) return setErro(`Peso inválido na peneira ${pen.rotulo}.`);
    }
    if (seco.trim() && ms == null) return setErro('Confira os pesos úmido e seco da MS (o seco não pode passar do úmido).');
    const id = adicionarAmostraMilho({
      codigo,
      coletadaEm,
      silo: silo.trim(),
      ...(responsavel.trim() ? { responsavel: responsavel.trim() } : {}),
      ...numeros,
      pesoUmidoG: secoG != null ? umidoG : null,
      pesoSecoG: secoG,
      ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
    });
    guardar(CHAVE_SILO, silo.trim());
    guardar(CHAVE_RESPONSAVEL, responsavel.trim());
    navigate(`/coletas?milho=${id}`);
  }

  return (
    <>
      <h1>Milho reidratado</h1>
      <p className="dica">
        Amostra da silagem de milho reidratado: anote o silo, faça a granulometria (peso retido em cada peneira) e, quando tiver, a MS. Dá para
        completar depois, na lista de <strong>Milho reidratado</strong> da Amostragem.
      </p>
      <form className="cartao grade-form" onSubmit={salvar}>
        <label>
          Silo
          <input list="silos-milho" value={silo} onChange={(e) => setSilo(e.target.value)} placeholder="Ex.: Trincheira 1" required />
          <datalist id="silos-milho">
            {SILOS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
        <label>
          Data e hora
          <input type="datetime-local" value={coletadaEm} onChange={(e) => setColetadaEm(e.target.value)} required />
        </label>
        <label>
          Responsável (opcional)
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        </label>

        <fieldset className="largo penn-state">
          <legend>Granulometria: peso em cada peneira (g)</legend>
          <div className="peneiras">
            {PENEIRAS_MILHO.map((pen, i) => (
              <label key={pen.campo}>
                {pen.rotulo}
                <input inputMode="decimal" value={pesos[pen.campo]} onChange={(e) => setPesos({ ...pesos, [pen.campo]: e.target.value })} />
                <PctPeneiraMilho i={i} pct={g ? g.pct[i] : null} />
              </label>
            ))}
          </div>
          {g ? <MetasMilho g={g} /> : <small className="mudo">As % e as metas aparecem quando os 5 pesos estiverem preenchidos.</small>}
          {g && <small className="mudo"> Total {fmt(g.totalG, 0)} g.</small>}
        </fieldset>

        <fieldset className="largo penn-state">
          <legend>MS (opcional agora)</legend>
          <div className="peneiras">
            <label>
              Úmido (g)
              <input inputMode="decimal" value={umido} onChange={(e) => setUmido(e.target.value)} />
            </label>
            <label>
              Seco (g)
              <input inputMode="decimal" value={seco} onChange={(e) => setSeco(e.target.value)} />
              <small className="mudo">{ms != null ? `MS ${fmt(ms, 1)}%` : '—'}</small>
            </label>
          </div>
        </fieldset>

        <label className="largo">
          Observações (opcional)
          <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </label>
        <p className="codigo-amostra largo">
          Código da amostra: <code className="codigo">{codigo}</code>
          <small className="mudo"> · gerado automaticamente; anote na etiqueta do saco.</small>
        </p>
        {erro && <p className="erro largo">{erro}</p>}
        <div className="acoes largo">
          <button type="submit" className="primario">Salvar amostra</button>
          <Link className="botao" to="/coletas">Cancelar</Link>
        </div>
      </form>
    </>
  );
}

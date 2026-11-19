import { useState, type FormEvent } from 'react';
import { SILOS } from '../silos';
import { Link, useNavigate } from 'react-router-dom';
import { adicionarAmostraColheita, adicionarVeiculo, useDados } from '../dados';
import { agoraLocal, normalizarPlaca } from '../colheita';
import { placaValida, proximoNumero, veiculoDaPlaca } from '../veiculos';
import { usePermissoes } from '../permissoes';
import { PENEIRAS, pennState, proximoCodigoColheita, type CampoPeneira } from '../amostragemColheita';
import { fmt, parseNum } from '../util';
import { PctPeneira } from '../PennState';

const CHAVE_TALHAO = 'silagem-ms:amostra-colheita-talhao';
const CHAVE_RESPONSAVEL = 'silagem-ms:amostra-colheita-responsavel';
const OUTRO = '__outro';

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

/**
 * Amostragem de colheita: o time de campo amostra o caminhão. Registra talhão de origem, caminhão,
 * silo de destino e o Penn State (4 peneiras, em g). A MS fica para depois, em "Aguardando MS".
 */
export default function NovaAmostraColheita() {
  const dados = useDados();
  const navigate = useNavigate();
  const [talhaoId, setTalhaoId] = useState(lembrar(CHAVE_TALHAO));
  const [coletadaEm, setColetadaEm] = useState(agoraLocal());
  const [veiculoId, setVeiculoId] = useState('');
  const [placa, setPlaca] = useState('');
  const [motorista, setMotorista] = useState('');
  const [salvarNaLista, setSalvarNaLista] = useState(true);
  const { podeCadastrarVeiculos, nomeUsuario } = usePermissoes();
  const [silo, setSilo] = useState('');
  // quem está logado; sem nome na conta, o último digitado neste aparelho
  const [responsavel, setResponsavel] = useState(nomeUsuario.trim() || lembrar(CHAVE_RESPONSAVEL));
  const [pesos, setPesos] = useState<Record<CampoPeneira, string>>({ peneira19G: '', peneira8G: '', peneira4G: '', fundoG: '' });
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');

  if (!dados) return null;
  const veiculos = dados.veiculos;
  const digitarPlaca = !veiculos.length || veiculoId === OUTRO;
  const numeros = Object.fromEntries(PENEIRAS.map((p) => [p.campo, parseNum(pesos[p.campo])])) as Record<CampoPeneira, number | null>;
  const ps = pennState(numeros);
  const talhao = dados.talhoes.find((t) => t.id === talhaoId);
  const codigo = talhao ? proximoCodigoColheita(talhao.nome, coletadaEm, dados.amostrasColheita) : null;

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!talhao || !codigo) return setErro('Escolha o talhão de onde veio o caminhão.');
    const v = digitarPlaca ? veiculoDaPlaca(veiculos, placa) : veiculos.find((x) => x.id === veiculoId);
    if (!digitarPlaca && !v) return setErro('Escolha o caminhão.');
    const p = v?.placa ?? normalizarPlaca(placa);
    if (!p) return setErro('Informe a placa do caminhão.');
    if (!silo.trim()) return setErro('Escolha o silo para onde vai o caminhão.');
    for (const pen of PENEIRAS) {
      if (pesos[pen.campo].trim() && (numeros[pen.campo] == null || numeros[pen.campo]! < 0)) return setErro(`Peso inválido na peneira ${pen.rotulo}.`);
    }
    // Motorista: o do cadastro do caminhão; se o caminhão não está na lista, o digitado.
    const nomeMotorista = v?.motorista ?? motorista.trim().replace(/\s+/g, ' ');
    // Caminhão novo: quem cadastra veículos pode já incluí-lo na lista.
    if (!v && podeCadastrarVeiculos && salvarNaLista && nomeMotorista && placaValida(p)) {
      adicionarVeiculo({ numero: proximoNumero(veiculos), motorista: nomeMotorista, placa: p });
    }
    const id = adicionarAmostraColheita({
      codigo,
      talhaoId,
      coletadaEm,
      placa: p,
      ...(nomeMotorista ? { motorista: nomeMotorista } : {}),
      silo: silo.trim(),
      ...(responsavel.trim() ? { responsavel: responsavel.trim() } : {}),
      ...numeros,
      pesoUmidoG: null,
      pesoSecoG: null,
      ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
    });
    guardar(CHAVE_TALHAO, talhaoId);
    guardar(CHAVE_RESPONSAVEL, responsavel.trim());
    navigate(`/coletas?colheita=${id}`);
  }

  return (
    <>
      <h1>Amostragem de colheita</h1>
      <p className="dica">
        Amostra do caminhão: anote o talhão de onde ele veio, o caminhão e o silo de destino, e faça o Penn State na hora. A MS é lançada
        depois, no quadro <strong>Aguardando MS</strong> da Amostragem.
      </p>
      <form className="cartao grade-form" onSubmit={salvar}>
        <label>
          Talhão de origem
          <select value={talhaoId} onChange={(e) => setTalhaoId(e.target.value)} required>
            <option value="">Escolha…</option>
            {dados.talhoes.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Data e hora
          <input type="datetime-local" value={coletadaEm} onChange={(e) => setColetadaEm(e.target.value)} required />
        </label>
        {veiculos.length > 0 && (
          <label>
            Caminhão
            <select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} required>
              <option value="">Escolha…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>{v.numero != null ? `${v.numero} – ` : ''}{v.placa} · {v.motorista}</option>
              ))}
              <option value={OUTRO}>Outro (digitar placa e motorista)</option>
            </select>
          </label>
        )}
        {digitarPlaca && (
          <>
            <label>
              Placa do caminhão
              <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="Ex.: ABC1D23" required />
            </label>
            <label>
              Motorista
              <input value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder="Nome do motorista" autoComplete="off" />
            </label>
            {podeCadastrarVeiculos && (
              <label className="largo opcao-check">
                <input type="checkbox" checked={salvarNaLista} onChange={(e) => setSalvarNaLista(e.target.checked)} />
                Incluir este caminhão na lista de veículos (com placa e motorista)
              </label>
            )}
          </>
        )}
        <label>
          Silo de destino
          <select value={silo} onChange={(e) => setSilo(e.target.value)} required>
            <option value="">Escolha…</option>
            {SILOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Responsável (opcional)
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        </label>

        <fieldset className="largo penn-state">
          <legend>Penn State: peso em cada peneira (g)</legend>
          <div className="peneiras">
            {PENEIRAS.map((pen, i) => (
              <label key={pen.campo}>
                {pen.rotulo}
                <input inputMode="decimal" value={pesos[pen.campo]} onChange={(e) => setPesos({ ...pesos, [pen.campo]: e.target.value })} />
                <PctPeneira i={i} pct={ps ? ps.pct[i] : null} />
              </label>
            ))}
          </div>
          <small className="mudo">{ps ? `Total ${fmt(ps.totalG, 0)} g.` : 'A % de cada peneira aparece quando os 4 pesos estiverem preenchidos.'} Dá para completar depois, se preciso.</small>
        </fieldset>

        <label className="largo">
          Observações (opcional)
          <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </label>
        <p className="codigo-amostra largo">
          Código da amostra:{' '}
          {codigo ? <code className="codigo">{codigo}</code> : <span className="mudo">escolha o talhão</span>}
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

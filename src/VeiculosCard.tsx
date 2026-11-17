import { useState, type FormEvent } from 'react';
import { adicionarVeiculo, atualizarVeiculo, excluirVeiculo, useDados } from './dados';
import { normalizarPlaca } from './colheita';
import { placaValida, proximoNumero, veiculoDaPlaca } from './veiculos';
import { usePermissoes } from './permissoes';
import { Icone } from './Icone';
import type { Veiculo } from './tipos';

/**
 * Colheita → Veículos da colheita: motorista e placa de cada caminhão. Todos veem; só quem cadastra
 * veículos (GESTORES_VEICULOS) inclui, edita e remove. A Colheita usa esta lista ao registrar a carga.
 */
export default function VeiculosCard() {
  const dados = useDados();
  const { podeCadastrarVeiculos } = usePermissoes();
  const [motorista, setMotorista] = useState('');
  const [placa, setPlaca] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [editando, setEditando] = useState<string | null>(null);

  if (!dados) return null;
  const veiculos = dados.veiculos;

  /** Confere motorista e placa; devolve a mensagem de erro ou null. */
  function validar(m: string, p: string, ignorarId?: string): string | null {
    if (!m.trim()) return 'Informe o nome do motorista.';
    if (!placaValida(p)) return 'Placa inválida: use 7 caracteres, como ABC1234 ou ABC1D23.';
    const outro = veiculoDaPlaca(veiculos, p);
    if (outro && outro.id !== ignorarId) return `A placa ${p} já está cadastrada (${outro.motorista}).`;
    return null;
  }

  function incluir(e: FormEvent) {
    e.preventDefault();
    setOk('');
    const p = normalizarPlaca(placa);
    const msg = validar(motorista, p);
    if (msg) return setErro(msg);
    adicionarVeiculo({ numero: proximoNumero(veiculos), motorista: motorista.trim().replace(/\s+/g, ' '), placa: p });
    setErro('');
    setOk(`Veículo ${p} (${motorista.trim()}) cadastrado.`);
    setMotorista('');
    setPlaca('');
  }

  return (
    <div className="cartao veiculos">
      <div className="cabecalho-cartao">
        <h2>Veículos da colheita</h2>
        <span className="mudo">{veiculos.length}</span>
      </div>
      <p className="dica">
        Caminhões da silagem, com motorista e placa. Na amostragem de colheita, o caminhão é escolhido desta lista (ou digitado, com o
        motorista, se ainda não estiver nela).{!podeCadastrarVeiculos && ' Só a Maria Laura inclui ou altera veículos.'}
      </p>

      {!veiculos.length ? (
        <p className="vazio">Nenhum veículo cadastrado.</p>
      ) : (
        <table className="tabela-cartoes lista-compacta tabela-veiculos">
          <thead>
            <tr>
              <th className="n">Nº</th>
              <th>Motorista</th>
              <th>Placa</th>
              {podeCadastrarVeiculos && <th />}
            </tr>
          </thead>
          <tbody>
            {veiculos.map((v) =>
              editando === v.id ? (
                <LinhaEdicao key={v.id} v={v} validar={validar} aoFechar={() => setEditando(null)} />
              ) : (
                <tr key={v.id}>
                  <td className="n mudo">{v.numero ?? '—'}</td>
                  <td><strong>{v.motorista}</strong></td>
                  <td className="placa">{v.placa}</td>
                  {podeCadastrarVeiculos && (
                    <td className="acoes-veiculo">
                      <button type="button" className="icone-acao" aria-label={`Editar ${v.placa}`} title="Editar" onClick={() => setEditando(v.id)}>
                        <Icone nome="editar" />
                      </button>
                      <button
                        type="button"
                        className="icone-acao perigo"
                        aria-label={`Remover ${v.placa}`}
                        title="Remover"
                        onClick={() => confirm(`Remover o veículo ${v.placa} (${v.motorista})? As cargas já registradas não mudam.`) && excluirVeiculo(v.id)}
                      >
                        <Icone nome="excluir" />
                      </button>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {podeCadastrarVeiculos && (
        <form className="grade-form novo-veiculo" onSubmit={incluir}>
          <h3 className="largo">Novo veículo</h3>
          <label>
            Nome do motorista
            <input value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder="Ex.: João da Silva" autoComplete="off" />
          </label>
          <label>
            Placa
            <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="Ex.: ABC1D23" maxLength={8} autoComplete="off" />
          </label>
          {erro && <p className="erro largo">{erro}</p>}
          {ok && <p className="ok largo">{ok}</p>}
          <div className="acoes largo">
            <button type="submit" className="primario"><Icone nome="adicionar" /> Cadastrar veículo</button>
          </div>
        </form>
      )}
    </div>
  );
}

function LinhaEdicao({ v, validar, aoFechar }: { v: Veiculo; validar: (m: string, p: string, ignorarId?: string) => string | null; aoFechar: () => void }) {
  const [motorista, setMotorista] = useState(v.motorista);
  const [placa, setPlaca] = useState(v.placa);
  const [erro, setErro] = useState('');

  function salvar() {
    const p = normalizarPlaca(placa);
    const msg = validar(motorista, p, v.id);
    if (msg) return setErro(msg);
    atualizarVeiculo(v.id, { motorista: motorista.trim().replace(/\s+/g, ' '), placa: p });
    aoFechar();
  }

  return (
    <tr className="linha-edicao-veiculo">
      <td className="n mudo">{v.numero ?? '—'}</td>
      <td>
        <input value={motorista} onChange={(e) => setMotorista(e.target.value)} aria-label="Nome do motorista" />
      </td>
      <td>
        <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} aria-label="Placa" maxLength={8} />
      </td>
      <td className="acoes-veiculo">
        <button type="button" className="primario mini" onClick={salvar}>Salvar</button>
        <button type="button" className="mini" onClick={aoFechar}>Cancelar</button>
        {erro && <p className="erro">{erro}</p>}
      </td>
    </tr>
  );
}

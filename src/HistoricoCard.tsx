import { useState } from 'react';
import { dadosAtuais, repositorio } from './dados';
import { FAZENDA_ID } from './firebaseConfig';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';
import { marcarRestaurado, opsDeRestauracao, ROTULO_ACAO, useHistorico, type EntradaHistorico } from './historico';
import { usePermissoes } from './permissoes';

function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function pessoa(email: string): string {
  return email ? email.split('@')[0] : '—';
}

/** Card de Configurações: últimas alterações feitas no app, com "Desfazer" em exclusões e edições. */
export default function Historico({ meuEmail }: { meuEmail: string }) {
  const fs = FIREBASE_ATIVO ? obterFirebase().firestore : null;
  const lista = useHistorico(fs, FAZENDA_ID);
  const { podeExcluir } = usePermissoes();
  const [msg, setMsg] = useState('');
  const [mostrar, setMostrar] = useState(15);

  if (!fs) return null;

  async function desfazer(e: EntradaHistorico) {
    setMsg('');
    const ops = opsDeRestauracao(e, dadosAtuais());
    if (!ops.length) {
      setMsg('Nada a restaurar: os registros dessa alteração já estão como antes (ou foram excluídos depois).');
      return;
    }
    if (!confirm(`Desfazer "${ROTULO_ACAO[e.acao].toLowerCase()} ${e.descricao}"?`)) return;
    try {
      repositorio().lote(ops, { acao: 'restaurou', descricao: e.descricao });
      await marcarRestaurado(fs!, FAZENDA_ID, e.id, meuEmail);
      setMsg(`Restaurado: ${e.descricao}.`);
    } catch (err) {
      setMsg(`Falha ao restaurar: ${(err as Error).message}`);
    }
  }

  return (
    <div className="cartao">
      <h2>Histórico de alterações</h2>
      <p className="dica">
        Tudo o que foi criado, editado ou excluído, por quem e quando, em qualquer aparelho. Exclusões e edições podem ser desfeitas
        por quem tem permissão de excluir.
      </p>
      {lista === undefined ? (
        <p className="vazio">Carregando…</p>
      ) : lista === null ? (
        <p className="erro">
          Histórico indisponível: o banco recusou a leitura. Publique as regras mais recentes do Firestore (<code>npm run regras</code>).
        </p>
      ) : !lista.length ? (
        <p className="vazio">Nenhuma alteração registrada ainda.</p>
      ) : (
        <ul className="historico">
          {lista.slice(0, mostrar).map((e) => (
            <li key={e.id} className={`historico-${e.acao}`}>
              <span className="mudo historico-quando">{quando(e.em)} · {pessoa(e.quem)}</span>
              <span className="historico-texto">
                <strong>{ROTULO_ACAO[e.acao]}</strong> {e.descricao}
              </span>
              <span className="espaco" />
              {e.restauradoEm ? (
                <span className="selo selo-ideal" title={`por ${pessoa(e.restauradoPor ?? '')}`}>desfeito</span>
              ) : (
                podeExcluir && e.itensJson && (e.acao === 'excluiu' || e.acao === 'editou') && (
                  <button type="button" className="mini" onClick={() => desfazer(e)}>Desfazer</button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {lista && lista.length > mostrar && (
        <div className="acoes">
          <button type="button" onClick={() => setMostrar(mostrar + 30)}>Mostrar mais</button>
        </div>
      )}
      {msg && <p className="aviso">{msg}</p>}
    </div>
  );
}

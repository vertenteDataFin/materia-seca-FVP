import { useMemo, useRef, useState } from 'react';
import { importarCargas, useDados } from '../dados';
import { lerArquivoBalanca, sugerirTalhao, type LinhaBalanca } from '../relatorioBalanca';
import { fmtSaida, normalizarPlaca } from '../colheita';
import { motoristaNaData, placaCorrigida, veiculoDaCarga, veiculoDaPlaca } from '../veiculos';
import { nomeComSigla } from '../MapaTalhoes';
import { Icone } from '../Icone';
import { fmt } from '../util';
import type { Carga, Novo } from '../tipos';

/** Origem da OBS → talhão escolhido, lembrado neste aparelho para os próximos relatórios. */
const CHAVE_ORIGENS = 'silagem-ms:balanca-origens';
const NAO_IMPORTAR = '';

function origensLembradas(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ORIGENS) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

const SEM_ORIGEM = '(sem talhão na observação)';
const origemDe = (l: LinhaBalanca) => l.textoTalhao || SEM_ORIGEM;

/**
 * Importa o relatório da balança (listagem de cargas, .xlsx): cada romaneio completo vira uma carga pesada.
 * O talhão vem da observação ("…-CAU TALHÃO 02"); cada origem é ligada a um talhão do app antes de gravar.
 * Romaneios já importados e caminhões ainda sem o peso cheio ficam de fora.
 */
export default function ImportarBalanca({ aoFechar }: { aoFechar: () => void }) {
  const dados = useDados();
  const arquivo = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [linhas, setLinhas] = useState<LinhaBalanca[] | null>(null);
  const [origens, setOrigens] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const [feito, setFeito] = useState('');

  const romaneiosImportados = useMemo(() => new Set((dados?.cargas ?? []).map((c) => c.romaneio).filter(Boolean)), [dados]);

  if (!dados) return null;
  const talhoes = dados.talhoes;
  const situacao = (l: LinhaBalanca) => (romaneiosImportados.has(l.romaneio) ? 'importada' : !l.completa ? 'incompleta' : 'nova');
  const novas = (linhas ?? []).filter((l) => situacao(l) === 'nova');
  const gruposNovos = [...new Set(novas.map(origemDe))];
  const aImportar = novas.filter((l) => origens[origemDe(l)]);

  async function ler(f: File) {
    setErro('');
    setFeito('');
    setLendo(true);
    try {
      const lidas = await lerArquivoBalanca(f);
      if (!lidas.length) throw new Error('Nenhum romaneio encontrado no arquivo.');
      setNomeArquivo(f.name);
      setLinhas(lidas);
      // talhão de cada origem: o já escolhido antes neste aparelho; senão a sugestão pelo nome
      const lembradas = origensLembradas();
      const inicial: Record<string, string> = {};
      for (const o of new Set(lidas.map(origemDe))) {
        const lembrado = lembradas[o];
        if (lembrado && talhoes.some((t) => t.id === lembrado)) inicial[o] = lembrado;
        else inicial[o] = (o !== SEM_ORIGEM && sugerirTalhao(o, talhoes)?.talhaoId) || NAO_IMPORTAR;
      }
      setOrigens(inicial);
    } catch (e) {
      setLinhas(null);
      setErro(`Não foi possível ler o arquivo: ${(e as Error).message}`);
    } finally {
      setLendo(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  function importar() {
    if (!aImportar.length) return;
    const cargas: Novo<Carga>[] = aImportar.map((l) => {
      // pela placa; sem placa ("SEM PLACA"), pelo "MOTORISTA N" da observação
      const v = veiculoDaCarga(dados!.veiculos, l.placa, l.obs);
      // do cadastro (com o substituto do período, se houver); sem cadastro, o do relatório
      const motorista = (v && motoristaNaData(v, l.pesadoEm)) || l.motoristaRelatorio;
      return {
        talhaoId: origens[origemDe(l)],
        saidaEm: l.pesadoEm,
        placa: v ? normalizarPlaca(v.placa) : placaCorrigida(l.placa),
        ...(motorista ? { motorista } : {}),
        ...(l.silo ? { silo: l.silo } : {}),
        pesoBrutoKg: l.totalKg,
        taraKg: l.taraKg,
        pesadoEm: new Date(l.pesadoEm).toISOString(),
        romaneio: l.romaneio,
        ...(l.obs ? { observacoes: `Balança: ${l.obs}` } : {}),
      };
    });
    importarCargas(cargas, `importou ${cargas.length} carga(s) do relatório da balança (${nomeArquivo})`);
    try {
      localStorage.setItem(CHAVE_ORIGENS, JSON.stringify({ ...origensLembradas(), ...Object.fromEntries(Object.entries(origens).filter(([, id]) => id)) }));
    } catch {
      /* sem armazenamento: só não lembra */
    }
    const t = cargas.reduce((s, c) => s + ((c.pesoBrutoKg ?? 0) - (c.taraKg ?? 0)), 0) / 1000;
    setFeito(`${cargas.length} carga(s) importada(s), ${fmt(t, 1)} t de matéria natural.`);
    setLinhas(null);
  }

  const contagem = (s: string) => (linhas ?? []).filter((l) => situacao(l) === s).length;

  return (
    <div className="cartao importar-balanca">
      <div className="cabecalho-cartao">
        <h2><Icone nome="balanca" /> Importar relatório da balança</h2>
        <button type="button" className="icone-acao" aria-label="Fechar" title="Fechar" onClick={aoFechar}><Icone nome="fechar" /></button>
      </div>
      <p className="dica">
        Escolha a listagem de cargas exportada da balança (.xlsx). Cada romaneio com peso cheio e tara vira uma carga; o talhão e o silo
        vêm da observação. Romaneios já importados não se repetem, e caminhões que ainda não voltaram carregados ficam para o próximo relatório.
      </p>
      <div className="acoes">
        <button type="button" className="primario" disabled={lendo} onClick={() => arquivo.current?.click()}>
          {lendo ? 'Lendo…' : linhas ? 'Escolher outro arquivo' : 'Escolher arquivo'}
        </button>
        <input ref={arquivo} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
      </div>
      {erro && <p className="erro">{erro}</p>}
      {feito && <p className="ok">{feito}</p>}

      {linhas && (
        <>
          <p className="resumo-importacao">
            <strong>{nomeArquivo}</strong>: {linhas.length} romaneio(s) · <strong>{contagem('nova')} novo(s)</strong>
            {contagem('importada') > 0 && <> · {contagem('importada')} já importado(s)</>}
            {contagem('incompleta') > 0 && <> · {contagem('incompleta')} sem peso cheio (caminhão ainda não voltou)</>}
          </p>

          {gruposNovos.length > 0 && (
            <div className="origens">
              <h3>De qual talhão veio cada carga?</h3>
              {gruposNovos.map((o) => {
                const n = novas.filter((l) => origemDe(l) === o).length;
                const sug = o !== SEM_ORIGEM ? sugerirTalhao(o, talhoes) : null;
                const conferir = sug?.certeza === 'conferir' && origens[o] === sug.talhaoId;
                return (
                  <label key={o} className="origem">
                    <span>
                      <code className="codigo">{o}</code> <small className="mudo">({n} carga{n === 1 ? '' : 's'})</small>
                      {conferir && <small className="aviso-conferir"> confira: nome parecido, não igual</small>}
                    </span>
                    <select value={origens[o] ?? NAO_IMPORTAR} onChange={(e) => setOrigens({ ...origens, [o]: e.target.value })}>
                      <option value={NAO_IMPORTAR}>— não importar —</option>
                      {talhoes.map((t) => (
                        <option key={t.id} value={t.id}>{nomeComSigla(t.nome, t.fazenda)}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}

          <div className="rolagem">
            <table className="tabela-cartoes lista-compacta tabela-balanca">
              <thead>
                <tr>
                  <th>Romaneio</th>
                  <th>Pesagem</th>
                  <th>Caminhão</th>
                  <th className="n">Líquido t</th>
                  <th className="oculta-cel">Silo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const s = situacao(l);
                  const talhao = talhoes.find((t) => t.id === origens[origemDe(l)]);
                  return (
                    <tr key={l.romaneio} className={s !== 'nova' ? 'ignorada' : ''}>
                      <td><strong>{l.romaneio}</strong></td>
                      <td>{l.pesadoEm ? fmtSaida(l.pesadoEm) : '—'}</td>
                      {(() => {
                        const v = veiculoDaCarga(dados.veiculos, l.placa, l.obs);
                        const pelaObs = v && !veiculoDaPlaca(dados.veiculos, l.placa);
                        return (
                          <td title={pelaObs ? `Sem placa na balança: caminhão ${v.numero} pela observação` : undefined}>
                            {v ? normalizarPlaca(v.placa) : l.placa || '—'}
                            {pelaObs && <small className="mudo"> (obs.)</small>}
                            <div className="mudo"><small>{(v && motoristaNaData(v, l.pesadoEm)) || l.motoristaRelatorio || '—'}</small></div>
                          </td>
                        );
                      })()}
                      <td className="n">{l.completa ? fmt((l.liquidoKg ?? (l.totalKg! - l.taraKg!)) / 1000, 2) : '—'}</td>
                      <td className="oculta-cel">{l.silo || '—'}</td>
                      <td>
                        {s === 'importada' ? (
                          <span className="selo selo-ideal">já importada</span>
                        ) : s === 'incompleta' ? (
                          <span className="selo">sem peso cheio</span>
                        ) : talhao ? (
                          <span className="selo selo-baixo">{nomeComSigla(talhao.nome, talhao.fazenda)}</span>
                        ) : (
                          <span className="selo selo-alto">sem talhão</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="acoes">
            <button type="button" className="primario" disabled={!aImportar.length} onClick={importar}>
              <Icone nome="ok" /> Importar {aImportar.length} carga{aImportar.length === 1 ? '' : 's'}
            </button>
            {novas.length > aImportar.length && <span className="mudo"><small>{novas.length - aImportar.length} sem talhão ficam de fora.</small></span>}
          </div>
        </>
      )}
    </div>
  );
}

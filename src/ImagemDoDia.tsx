import { useState } from 'react';
import type { Parametros } from './calc';
import { compartilharOuBaixarImagem } from './imagemAmostraColheita';
import { coletasDoDia, datasComColeta, gerarImagemColetasDia } from './imagemColetasDia';
import type { Dados } from './tipos';
import { fmtData } from './util';

/** Imagem (PNG) das amostragens de campo de um dia, para mandar pelo WhatsApp. */
export default function ImagemDoDia({ dados, parametros }: { dados: Pick<Dados, 'talhoes' | 'coletas' | 'amostras'>; parametros: Parametros }) {
  const datas = datasComColeta(dados);
  const [data, setData] = useState(datas[0] ?? '');
  const [gerando, setGerando] = useState(false);
  if (!datas.length) return null;
  const dia = datas.includes(data) ? data : datas[0];
  async function gerar() {
    setGerando(true);
    try {
      const coletas = coletasDoDia(dia, dados, parametros);
      if (!coletas.length) throw new Error('nenhum ponto registrado nas coletas desse dia');
      const blob = await gerarImagemColetasDia(dia, coletas, parametros);
      await compartilharOuBaixarImagem(blob, `Amostragem_campo_${dia}.png`, `Amostragem de campo de ${fmtData(dia)}`);
    } catch (e) {
      alert(`Não deu para gerar a imagem: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  }
  return (
    <div className="imagem-dia">
      <label>
        Imagem das amostras do dia{' '}
        <select value={dia} onChange={(e) => setData(e.target.value)} aria-label="Dia das amostras de campo">
          {datas.map((d) => (
            <option key={d} value={d}>{fmtData(d)}</option>
          ))}
        </select>
      </label>
      <button type="button" className="primario" disabled={gerando} onClick={gerar}>
        {gerando ? 'Gerando…' : 'Gerar imagem'}
      </button>
    </div>
  );
}

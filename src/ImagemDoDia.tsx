import { useState } from 'react';
import type { Parametros } from './calc';
import { Icone } from './Icone';
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
      <select value={dia} onChange={(e) => setData(e.target.value)} aria-label="Dia do relatório das amostras de campo" title="Dia do relatório (imagem)">
        {datas.map((d) => (
          <option key={d} value={d}>{fmtData(d)}</option>
        ))}
      </select>
      <button type="button" className="primario" disabled={gerando} onClick={gerar} title="Gerar a imagem das amostras de campo do dia para compartilhar">
        <Icone nome="enviar" /> {gerando ? 'Gerando…' : 'Relatório'}
      </button>
    </div>
  );
}

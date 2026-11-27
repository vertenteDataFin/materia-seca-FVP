import { useState, type ChangeEvent } from 'react';

/**
 * Fotos da amostra para o print: não são gravadas em lugar nenhum, só entram na imagem gerada.
 * Ficam na tela até fechar a amostra.
 */
const LADO_MAX = 2000;

/** Reduz a foto da câmera (respeita a orientação do celular) para desenhar no print sem pesar. */
export async function prepararFoto(arquivo: Blob): Promise<ImageBitmap> {
  const img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  if (escala === 1) return img;
  const menor = await createImageBitmap(img, { resizeWidth: Math.round(img.width * escala), resizeHeight: Math.round(img.height * escala), resizeQuality: 'high' });
  img.close();
  return menor;
}

export interface FotoPrint {
  id: string;
  imagem: ImageBitmap;
  /** Para a miniatura na tela. */
  url: string;
}

let seq = 0;

/** Botão "Adicionar foto": câmera ou galeria. */
export function BotaoFoto({ aoEscolher }: { aoEscolher: (fotos: FotoPrint[]) => void }) {
  const [processando, setProcessando] = useState(false);
  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!arquivos.length) return;
    setProcessando(true);
    try {
      aoEscolher(
        await Promise.all(arquivos.map(async (a) => ({ id: `f${++seq}`, imagem: await prepararFoto(a), url: URL.createObjectURL(a) }))),
      );
    } catch (erro) {
      alert(`Não deu para usar a foto: ${(erro as Error).message}`);
    } finally {
      setProcessando(false);
    }
  }
  return (
    <label className={`botao botao-foto${processando ? ' desativado' : ''}`}>
      {processando ? 'Preparando foto…' : 'Adicionar foto'}
      <input type="file" accept="image/*" multiple hidden disabled={processando} onChange={escolher} />
    </label>
  );
}

/** Miniaturas das fotos escolhidas, com × para tirar do print. */
export function MiniaturasFotos({ fotos, aoTirar }: { fotos: FotoPrint[]; aoTirar: (id: string) => void }) {
  if (!fotos.length) return null;
  return (
    <div className="miniaturas-fotos">
      {fotos.map((f, i) => (
        <div key={f.id} className="miniatura-foto">
          <img src={f.url} alt={`Foto ${i + 1} da amostra`} />
          <button type="button" className="excluir-foto" aria-label={`Tirar foto ${i + 1} do print`} onClick={() => aoTirar(f.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

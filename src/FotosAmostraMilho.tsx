import { useState, type ChangeEvent } from 'react';
import { comprimirFoto, DIAS_FOTO, excluirFotoMilho, salvarFotoMilho, type FotoMilho } from './fotosMilho';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';

/** Fotos por amostra (entram todas no relatório; com mais, ele fica largo demais). */
export const MAX_FOTOS = 4;

/** Botão "Adicionar foto": câmera ou galeria; reduz e grava (ficam {@link DIAS_FOTO} dias). */
export function BotaoFoto({ amostraId, vagas }: { amostraId: string; vagas: number }) {
  const [processando, setProcessando] = useState(false);
  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])].slice(0, vagas);
    e.target.value = '';
    if (!arquivos.length) return;
    setProcessando(true);
    try {
      for (const a of arquivos) salvarFotoMilho(amostraId, await comprimirFoto(a));
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

/** Miniaturas das fotos gravadas, com × para excluir (quem enviou, administrador e membro). */
export function MiniaturasFotos({ fotos, podeExcluir }: { fotos: FotoMilho[]; podeExcluir: boolean }) {
  const eu = FIREBASE_ATIVO ? (obterFirebase().auth.currentUser?.email ?? '').toLowerCase() : '';
  if (!fotos.length) return null;
  return (
    <div className="miniaturas-fotos">
      {fotos.map((f, i) => (
        <div key={f.id} className="miniatura-foto">
          <img src={f.dataUrl} alt={`Foto ${i + 1} da amostra`} />
          {(podeExcluir || !FIREBASE_ATIVO || (!!eu && f.autor === eu)) && (
            <button type="button" className="excluir-foto" aria-label={`Excluir foto ${i + 1}`} onClick={() => confirm('Excluir esta foto?') && excluirFotoMilho(f.id)}>
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

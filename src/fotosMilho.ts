import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { FIREBASE_ATIVO, obterFirebase } from './firebase';
import { FAZENDA_ID } from './firebaseConfig';
import { gerarId } from './repositorio';

/**
 * Fotos das amostras de milho reidratado, numa coleção à parte (fazendas/<id>/fotosMilho), para não pesar:
 * - o celular reduz a foto (lado maior 1600 px, JPEG) antes de gravar: algumas centenas de KB em vez de 3–5 MB;
 * - a coleção não entra no carregamento do app: a foto só é baixada quando a amostra é aberta;
 * - ficam {@link DIAS_FOTO} dias e depois são apagadas pelo próprio app ({@link limparFotosAntigas}).
 */
export const DIAS_FOTO = 7;
const LADO_MAX = 1600;
/** Limite do texto da imagem (o documento do Firestore aceita até 1 MiB). */
const MAX_CARACTERES = 850_000;

export interface FotoMilho {
  id: string;
  amostraId: string;
  /** Imagem JPEG em data URL (base64). */
  dataUrl: string;
  criadoEm: Date;
  /** E-mail de quem enviou (minúsculas). */
  autor?: string;
}

/** Sem Firebase (modo só neste aparelho): fotos só na memória desta aba. */
const locais = new Map<string, FotoMilho>();
const ouvintesLocais = new Set<() => void>();
const avisarLocais = () => ouvintesLocais.forEach((cb) => cb());

function colecao() {
  return collection(obterFirebase().firestore, 'fazendas', FAZENDA_ID, 'fotosMilho');
}

/** Reduz a foto da câmera para gravar (respeita a orientação do celular). */
export async function comprimirFoto(arquivo: Blob): Promise<string> {
  const img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não processa imagens.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  let qualidade = 0.8;
  let url = canvas.toDataURL('image/jpeg', qualidade);
  while (url.length > MAX_CARACTERES && qualidade > 0.35) {
    qualidade -= 0.1;
    url = canvas.toDataURL('image/jpeg', qualidade);
  }
  if (url.length > MAX_CARACTERES) throw new Error('Foto grande demais mesmo reduzida.');
  return url;
}

/** Imagem pronta para desenhar no relatório. */
export async function imagemDaFoto(dataUrl: string): Promise<ImageBitmap> {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

/** Grava a foto (sem sinal, o Firestore guarda e envia depois). */
export function salvarFotoMilho(amostraId: string, dataUrl: string) {
  const id = gerarId();
  if (!FIREBASE_ATIVO) {
    locais.set(id, { id, amostraId, dataUrl, criadoEm: new Date() });
    avisarLocais();
    return;
  }
  const autor = (obterFirebase().auth.currentUser?.email ?? '').toLowerCase();
  setDoc(doc(colecao(), id), { amostraId, dataUrl, criadoEm: Timestamp.now(), autor }).catch((e) => {
    console.error(e);
    alert(`Não deu para gravar a foto: ${(e as Error).message}`);
  });
}

export function excluirFotoMilho(id: string) {
  if (!FIREBASE_ATIVO) {
    locais.delete(id);
    avisarLocais();
    return;
  }
  deleteDoc(doc(colecao(), id)).catch((e) => alert(`Não deu para excluir a foto: ${(e as Error).message}`));
}

/** Apaga as fotos de uma amostra (ao excluir a amostra). */
export function excluirFotosDaAmostra(amostraId: string) {
  if (!FIREBASE_ATIVO) {
    for (const [id, f] of locais) if (f.amostraId === amostraId) locais.delete(id);
    avisarLocais();
    return;
  }
  getDocs(query(colecao(), where('amostraId', '==', amostraId)))
    .then((snap) => Promise.all(snap.docs.map((d) => deleteDoc(d.ref))))
    .catch((e) => console.warn('Fotos da amostra não foram apagadas (somem sozinhas em 7 dias)', e));
}

/** Fotos de uma amostra, da mais antiga para a mais nova (undefined enquanto carrega). */
export function useFotosMilho(amostraId: string): FotoMilho[] | undefined {
  const [fotos, setFotos] = useState<FotoMilho[] | undefined>(undefined);
  useEffect(() => {
    if (!FIREBASE_ATIVO) {
      const ler = () => setFotos([...locais.values()].filter((f) => f.amostraId === amostraId));
      ler();
      ouvintesLocais.add(ler);
      return () => void ouvintesLocais.delete(ler);
    }
    return onSnapshot(
      query(colecao(), where('amostraId', '==', amostraId)),
      (snap) =>
        setFotos(
          snap.docs
            .map((d) => {
              const x = d.data();
              return {
                id: d.id,
                amostraId,
                dataUrl: String(x.dataUrl ?? ''),
                criadoEm: (x.criadoEm as Timestamp | undefined)?.toDate() ?? new Date(),
                autor: typeof x.autor === 'string' ? x.autor : undefined,
              };
            })
            .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()),
        ),
      (e) => {
        console.warn('Fotos indisponíveis', e);
        setFotos([]);
      },
    );
  }, [amostraId]);
  return fotos;
}

const CHAVE_LIMPEZA = 'silagem-ms:limpeza-fotos-milho';

/**
 * Apaga as fotos com mais de {@link DIAS_FOTO} dias. Roda ao abrir o app, no máximo uma vez por dia por aparelho;
 * as regras deixam qualquer membro apagar foto vencida.
 */
export async function limparFotosAntigas(): Promise<void> {
  if (!FIREBASE_ATIVO) return;
  const hoje = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(CHAVE_LIMPEZA) === hoje) return;
  } catch {
    /* sem armazenamento: limpa de novo, sem problema */
  }
  const limiteData = Timestamp.fromMillis(Date.now() - DIAS_FOTO * 86_400_000);
  try {
    for (let rodada = 0; rodada < 10; rodada++) {
      const snap = await getDocs(query(colecao(), where('criadoEm', '<', limiteData), limit(50)));
      if (snap.empty) break;
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      if (snap.size < 50) break;
    }
    try {
      localStorage.setItem(CHAVE_LIMPEZA, hoje);
    } catch {
      /* idem */
    }
  } catch (e) {
    console.warn('Limpeza das fotos antigas não rodou', e);
  }
}

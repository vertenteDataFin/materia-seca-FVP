import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Talhao } from './tipos';
import { siglaFazenda } from './kml';

export interface EstiloTalhao {
  /** Cor de preenchimento (padrão: verde). */
  cor?: string;
  /** Contorno tracejado (ex.: dado divergente). */
  tracejado?: boolean;
  /** Linha extra abaixo do nome (padrão: capim). */
  rotuloExtra?: string | null;
}

export interface Marcador {
  lat: number;
  lng: number;
  rotulo: string;
  /** Destaque (ex.: ponto fora do talhão). */
  alerta?: boolean;
  /** Origem da posição: 'gps' = bolinha cheia; 'mapa' = bolinha vazada. */
  origem?: 'gps' | 'mapa';
  titulo?: string;
}

interface Props {
  talhoes: Talhao[];
  selecionadoId?: string | null;
  aoSelecionar?: (t: Talhao) => void;
  estilo?: (t: Talhao) => EstiloTalhao;
  /** Pontos a desenhar (ex.: amostras com GPS). */
  marcadores?: Marcador[];
  /** Toque/clique num lugar vazio do mapa (ex.: marcar onde um ponto foi coletado). */
  aoClicarMapa?: (lat: number, lng: number) => void;
  /** Toque num marcador (índice em `marcadores`). */
  aoClicarMarcador?: (indice: number) => void;
  altura?: number | string;
  /** Classe extra no contêiner do mapa (ex.: altura flexível via CSS). */
  className?: string;
  /** Zoom máximo ao enquadrar (padrão 16; use 17–18 para um talhão só). */
  zoomMax?: number;
  /** Onde o usuário está ("Cadê eu?"): ponto azul com o círculo de precisão; o mapa vai até lá quando muda. */
  posicaoUsuario?: { lat: number; lng: number; precisaoM: number | null } | null;
}

const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/**
 * Nome curto como na foto: "Talhão 17A - PD" ou "PD - TALHAO 17 A" → "TL 17A"; "Pivô 1 - Conf" → "Pivô 1";
 * "Talhão C3 - Conf" → "C3"; "Talhão 17A Miyagi - PD" → "TL 17A Miyagi".
 */
/**
 * Nome curto com a identificação do local, como no KML: "Talhão 18 - PD" → "TL 18 - PD";
 * "Pivô 1 - Conf" → "Pivô 1 - Conf"; "PD - TALHAO 17 A" → "TL 17A - PD". Sem sigla no nome, usa a da fazenda.
 */
export function nomeComSigla(nome: string, fazenda = ''): string {
  const semAtividade = nome.replace(/\s*—.*$/, '').trim();
  const sigla =
    semAtividade.match(/\s+-\s+([A-Za-z]{1,5})$/)?.[1] ??
    semAtividade.match(/^([A-Za-z]{1,5})\s*-\s*/)?.[1] ??
    (fazenda ? siglaFazenda(fazenda) : '');
  const curto = nomeCurto(nome);
  if (!sigla) return curto;
  // Sigla em maiúsculas como no KML, exceto "Conf" (já é o padrão do app).
  const s = sigla.toUpperCase() === 'CONF' ? 'Conf' : sigla.toUpperCase();
  return `${curto} - ${s}`;
}

export function nomeCurto(nome: string): string {
  const s = nome
    .replace(/\s*—.*$/, '')
    .replace(/^[A-Z]+\s*-\s*/i, '')
    .replace(/\s+-\s+[A-Za-z]{1,5}$/, '')
    .trim();
  const pivo = s.match(/^PIV[OÔ]\s*0*(\d+)$/i);
  if (pivo) return `Pivô ${pivo[1]}`;
  const tl = s.match(/^TALH[AÃ]O\s*(\d+)\s*([A-Z]?)(\s+\S.*)?$/i);
  if (tl) return `TL ${tl[1]}${tl[2].toUpperCase()}${tl[3] ?? ''}`;
  return s.replace(/^TALH[AÃ]O\s*/i, '');
}

function estiloPath(sel: boolean, e: EstiloTalhao): L.PathOptions {
  return {
    color: sel ? '#ffe066' : (e.cor ?? '#2e9e3f'),
    weight: sel ? 4 : 2.5,
    dashArray: e.tracejado ? '8 6' : undefined,
    fillColor: e.cor ?? '#2e9e3f',
    fillOpacity: sel ? 0.6 : 0.42,
  };
}

/** Mapa com imagem de satélite e os contornos dos talhões, legendados como na foto da fazenda. */
export default function MapaTalhoes({ talhoes, selecionadoId, aoSelecionar, estilo, marcadores, aoClicarMapa, aoClicarMarcador, altura = 480, zoomMax = 16, className, posicaoUsuario }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);
  const camadaUsuarioRef = useRef<L.LayerGroup | null>(null);
  const clicarRef = useRef(aoClicarMapa);
  clicarRef.current = aoClicarMapa;
  const comGeo = talhoes.filter((t) => t.geometria?.length);

  // Cria o mapa uma vez
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
    L.tileLayer(SATELITE, { maxZoom: 18, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics' }).addTo(map);
    camadaRef.current = L.layerGroup().addTo(map);
    camadaUsuarioRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => clicarRef.current?.(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    // O contêiner pode mudar de tamanho depois (ex.: altura flexível no celular, rotação): o Leaflet precisa recalcular
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(divRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redesenha polígonos e rótulos quando os dados/seleção mudam
  useEffect(() => {
    const map = mapRef.current;
    const camada = camadaRef.current;
    if (!map || !camada) return;
    camada.clearLayers();
    if (!comGeo.length) return;

    const primeiraVez = !(map as unknown as { _ajustado?: boolean })._ajustado;
    const limites = L.latLngBounds([]);

    for (const t of comGeo) {
      const sel = t.id === selecionadoId;
      const e = estilo?.(t) ?? {};
      const latlngs = t.geometria!.map((anel) => anel.map(([lng, lat]) => [lat, lng] as [number, number]));
      const poly = L.polygon(latlngs, { ...estiloPath(sel, e), interactive: !!aoSelecionar }).addTo(camada);
      limites.extend(poly.getBounds());
      if (aoSelecionar) {
        poly.on('click', () => aoSelecionar(t));
        poly.on('mouseover', () => !sel && poly.setStyle({ fillOpacity: 0.5 }));
        poly.on('mouseout', () => !sel && poly.setStyle({ fillOpacity: 0.35 }));
      }

      const extra = e.rotuloExtra === undefined ? t.capim : e.rotuloExtra;
      const html = `<div class="rotulo-nome">${nomeCurto(t.nome)}</div>${extra ? `<div class="rotulo-extra">${extra.replace('/', '/<br>')}</div>` : ''}`;
      const marcador = L.marker(poly.getBounds().getCenter(), {
        icon: L.divIcon({ className: `rotulo-talhao ${sel ? 'sel' : ''}`, html, iconSize: [120, 40], iconAnchor: [60, 20] }),
        interactive: !!aoSelecionar,
        keyboard: false,
      }).addTo(camada);
      if (aoSelecionar) marcador.on('click', () => aoSelecionar(t));
    }

    (marcadores ?? []).forEach((m, i) => {
      const cor = m.alerta ? '#ff3b30' : '#ff7a00';
      const vazado = m.origem === 'mapa';
      const cm = L.circleMarker([m.lat, m.lng], {
        radius: aoClicarMarcador ? 9 : 7,
        color: vazado ? cor : '#fff',
        weight: vazado ? 3 : 2,
        fillColor: vazado ? '#fff' : cor,
        fillOpacity: 1,
        interactive: !!aoClicarMarcador,
        bubblingMouseEvents: false, // o toque no ponto não vira um toque no mapa
      })
        .bindTooltip(m.rotulo, { permanent: true, direction: 'top', offset: [0, -8], className: `tooltip-ponto ${m.alerta ? 'alerta' : ''} ${vazado ? 'mapa' : ''}` })
        .addTo(camada);
      if (aoClicarMarcador) cm.on('click', () => aoClicarMarcador(i));
      limites.extend([m.lat, m.lng]);
    });

    if (primeiraVez && limites.isValid()) {
      map.fitBounds(limites, { padding: [16, 16], maxZoom: zoomMax });
      (map as unknown as { _ajustado?: boolean })._ajustado = true;
    }
  });

  // Posição do usuário ("Cadê eu?"): desenha e leva o mapa até lá a cada leitura nova
  useEffect(() => {
    const map = mapRef.current;
    const camada = camadaUsuarioRef.current;
    if (!map || !camada) return;
    camada.clearLayers();
    if (!posicaoUsuario) return;
    const p: [number, number] = [posicaoUsuario.lat, posicaoUsuario.lng];
    if (posicaoUsuario.precisaoM != null && posicaoUsuario.precisaoM > 0) {
      L.circle(p, { radius: posicaoUsuario.precisaoM, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.15, interactive: false }).addTo(camada);
    }
    L.circleMarker(p, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false })
      .bindTooltip('Você', { permanent: true, direction: 'top', offset: [0, -10], className: 'tooltip-voce' })
      .addTo(camada);
    map.flyTo(p, Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [posicaoUsuario]);

  if (!comGeo.length) {
    return <p className="vazio">Nenhum talhão com contorno. Importe o KML em Talhões para ver o mapa.</p>;
  }

  return (
    <div className={`mapa ${aoClicarMapa ? 'clicavel' : ''}`}>
      <div ref={divRef} className={className} style={{ height: altura, width: '100%' }} aria-label="Mapa dos talhões" />
      {talhoes.length > comGeo.length && <p className="dica">{talhoes.length - comGeo.length} talhão(ões) sem contorno não aparecem no mapa.</p>}
    </div>
  );
}

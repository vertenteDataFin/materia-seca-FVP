// Ícones do Material Icons (Google, Apache 2.0) embutidos como SVG: funcionam offline e herdam a cor do texto.
import editar from '@material-design-icons/svg/filled/edit.svg?raw';
import excluir from '@material-design-icons/svg/filled/delete.svg?raw';
import fechar from '@material-design-icons/svg/filled/close.svg?raw';
import atualizar from '@material-design-icons/svg/filled/refresh.svg?raw';
import gps from '@material-design-icons/svg/filled/my_location.svg?raw';
import alerta from '@material-design-icons/svg/filled/warning.svg?raw';
import ok from '@material-design-icons/svg/filled/check.svg?raw';
import expandir from '@material-design-icons/svg/filled/expand_more.svg?raw';
import recolher from '@material-design-icons/svg/filled/chevron_right.svg?raw';
import subir from '@material-design-icons/svg/filled/arrow_upward.svg?raw';
import descer from '@material-design-icons/svg/filled/arrow_downward.svg?raw';
import ordenar from '@material-design-icons/svg/filled/swap_vert.svg?raw';
import painel from '@material-design-icons/svg/filled/bar_chart.svg?raw';
import mapa from '@material-design-icons/svg/filled/map.svg?raw';
import campo from '@material-design-icons/svg/filled/assignment.svg?raw';
import lab from '@material-design-icons/svg/filled/science.svg?raw';
import talhoes from '@material-design-icons/svg/filled/grass.svg?raw';
import config from '@material-design-icons/svg/filled/settings.svg?raw';
import mais from '@material-design-icons/svg/filled/more_horiz.svg?raw';
import adicionar from '@material-design-icons/svg/filled/add.svg?raw';
import filtro from '@material-design-icons/svg/filled/filter_list.svg?raw';

const ICONES = { editar, excluir, fechar, atualizar, gps, alerta, ok, expandir, recolher, subir, descer, ordenar, painel, mapa, campo, lab, talhoes, config, mais, adicionar, filtro } as const;

export type NomeIcone = keyof typeof ICONES;

/** Ícone inline (1em, cor do texto). Sem `titulo` é decorativo; com `titulo` vira imagem acessível. */
export function Icone({ nome, titulo, className = '' }: { nome: NomeIcone; titulo?: string; className?: string }) {
  return (
    <span
      className={`mi ${className}`.trim()}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      dangerouslySetInnerHTML={{ __html: ICONES[nome] }}
    />
  );
}

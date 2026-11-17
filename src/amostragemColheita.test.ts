// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { aguardandoMSColheita, msColheita, pennState, proximoCodigoColheita } from './amostragemColheita';

describe('amostragem de colheita', () => {
  it('código automático: talhão, dia/mês e sequência do talhão no dia', () => {
    expect(proximoCodigoColheita('Talhão 18 - PD', '2026-11-17T08:30', [])).toBe('TL18-1711-C1');
    const existentes = [{ codigo: 'TL18-1711-C1' }, { codigo: 'TL18-1711-C3' }, { codigo: 'TL21-1711-C7' }, { codigo: 'TL18-1611-C9' }, {}];
    // segue o maior do mesmo talhão e dia (não reaproveita o C2 de uma amostra excluída)
    expect(proximoCodigoColheita('Talhão 18 - PD', '2026-11-17T14:00', existentes)).toBe('TL18-1711-C4');
    expect(proximoCodigoColheita('Talhão 21 - Conf', '2026-11-18T07:00', existentes)).toBe('TL21-1811-C1');
  });

  it('Penn State: % de cada peneira sobre o total das 4', () => {
    const p = pennState({ peneira19G: 20, peneira8G: 100, peneira4G: 60, fundoG: 20 });
    expect(p?.totalG).toBe(200);
    expect(p?.pct).toEqual([10, 50, 30, 10]);
  });

  it('Penn State incompleto ou zerado não calcula', () => {
    expect(pennState({ peneira19G: 20, peneira8G: null, peneira4G: 60, fundoG: 20 })).toBeNull();
    expect(pennState({ peneira19G: 0, peneira8G: 0, peneira4G: 0, fundoG: 0 })).toBeNull();
  });

  it('MS como no laboratório: seco de 100 g úmido = MS %', () => {
    expect(msColheita({ pesoUmidoG: 100, pesoSecoG: 31 })).toBe(31);
    expect(msColheita({ pesoUmidoG: 100, pesoSecoG: null })).toBeNull();
    expect(aguardandoMSColheita({ pesoSecoG: null })).toBe(true);
    expect(aguardandoMSColheita({ pesoSecoG: 31 })).toBe(false);
  });
});

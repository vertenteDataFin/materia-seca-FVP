import { describe, expect, it } from 'vitest';
import { aguardandoMSColheita, msColheita, pennState } from './amostragemColheita';

describe('amostragem de colheita', () => {
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

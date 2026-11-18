// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chaveCapim, faltaPeFdn, fatoresPef, peFdnDaAmostra, textoPeFdn, type ConfigFdn } from './fdn';

const pen = { peneira19G: 20, peneira8G: 100, peneira4G: 60, fundoG: 20 }; // 10 · 50 · 30 · 10 %
const cfg: ConfigFdn = { pef: '4', fdnPorCapim: { [chaveCapim('Mombaça')]: 65 } };

describe('FDN efetiva', () => {
  it('pef do Penn State: > 8 mm = 19 + 8; > 4 mm = tudo menos o fundo', () => {
    const f = fatoresPef(pen)!;
    expect(f.pef8).toBeCloseTo(0.6);
    expect(f.pef4).toBeCloseTo(0.9);
    expect(fatoresPef({ ...pen, fundoG: null })).toBeNull();
  });

  it('FDN do capim (referência) quando não há laboratório; laboratório tem prioridade', () => {
    const ref = peFdnDaAmostra({ ...pen, fdnPct: null }, 'Mombaça', cfg);
    expect(ref.fonte).toBe('capim');
    expect(ref.peFdn8).toBeCloseTo(39); // 65 × 0,6
    expect(ref.peFdn4).toBeCloseTo(58.5); // 65 × 0,9
    const lab = peFdnDaAmostra({ ...pen, fdnPct: 70 }, 'Mombaça', cfg);
    expect(lab.fonte).toBe('laboratorio');
    expect(lab.peFdn4).toBeCloseTo(63);
    // capim escrito de outro jeito ("mombaca") acha a mesma referência
    expect(peFdnDaAmostra({ ...pen }, 'mombaca', cfg).fdnPct).toBe(65);
  });

  it('texto conforme o fator escolhido em Configurações', () => {
    const r = peFdnDaAmostra({ ...pen }, 'Mombaça', cfg);
    expect(textoPeFdn(r, '4')).toBe('58,5');
    expect(textoPeFdn(r, '8')).toBe('39,0');
    expect(textoPeFdn(r, 'ambos')).toBe('39,0 / 58,5');
  });

  it('sem FDN ou sem Penn State, diz o que falta', () => {
    const semFdn = peFdnDaAmostra({ ...pen }, 'Piatã', cfg);
    expect(semFdn.peFdn4).toBeNull();
    expect(faltaPeFdn(semFdn)).toBe('falta a FDN');
    expect(textoPeFdn(semFdn, '4')).toBeNull();
    const semPenn = peFdnDaAmostra({ peneira19G: null, peneira8G: null, peneira4G: null, fundoG: null, fdnPct: 60 }, 'Mombaça', cfg);
    expect(faltaPeFdn(semPenn)).toBe('falta o Penn State');
  });
});

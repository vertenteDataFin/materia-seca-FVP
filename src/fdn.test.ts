// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chaveCapim, CONFIG_FDN_PADRAO, faltaPeFdn, fatoresPef, peFdnDaAmostra, textoPeFdn, type ConfigFdn } from './fdn';
import { dentroDaFaixa } from './amostragemColheita';

const pen = { peneira19G: 20, peneira8G: 100, peneira4G: 60, fundoG: 20 }; // 10 · 50 · 30 · 10 %
const cfg: ConfigFdn = { pef: '4', fdnPadrao: null, fdnPorCapim: { [chaveCapim('Mombaça')]: 65 } };

describe('FDN efetiva', () => {
  it('igual à planilha COLHEITA SILAGEM SILO 01: (>19 + 8–19 + 4–8) ÷ total × 0,71', () => {
    // linha 5 da planilha: 22, 246, 28 e 20 g (total 316) → FDNfe 67%
    const r = peFdnDaAmostra({ peneira19G: 22, peneira8G: 246, peneira4G: 28, fundoG: 20 }, 'Mombaça', CONFIG_FDN_PADRAO);
    expect(r.fonte).toBe('padrao');
    expect(r.fdnPct).toBe(71);
    expect(r.peFdn4).toBeCloseTo((296 / 316) * 71); // 66,5
    expect(Math.round(r.peFdn4!)).toBe(67);
    // linha 6: 50, 294, 42 e 22 g (total 408) → 67%
    expect(Math.round(peFdnDaAmostra({ peneira19G: 50, peneira8G: 294, peneira4G: 42, fundoG: 22 }, '', CONFIG_FDN_PADRAO).peFdn4!)).toBe(67);
  });

  it('faixas ideais do Penn State da planilha: 3–8 · 45–65 · 30–40 · < 5', () => {
    // linha 5: 6,96 · 77,85 · 8,86 · 6,33 % → só a de 19 mm dentro
    const pct = [6.96, 77.85, 8.86, 6.33];
    expect(pct.map((p, i) => dentroDaFaixa(i, p))).toEqual([true, false, false, false]);
    expect([3, 45, 30, 4.99].map((p, i) => dentroDaFaixa(i, p))).toEqual([true, true, true, true]);
    expect([8.01, 65.01, 40.01, 5].map((p, i) => dentroDaFaixa(i, p))).toEqual([false, false, false, false]);
  });

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
    expect(faltaPeFdn(semFdn)).toMatch(/^falta a FDN/);
    expect(textoPeFdn(semFdn, '4')).toBeNull();
    const semPenn = peFdnDaAmostra({ peneira19G: null, peneira8G: null, peneira4G: null, fundoG: null, fdnPct: 60 }, 'Mombaça', cfg);
    expect(faltaPeFdn(semPenn)).toBe('falta o Penn State');
  });
});

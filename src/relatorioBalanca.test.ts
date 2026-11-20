// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerLinhasBalanca, lerObs, lerXlsxBalanca, nomeMotorista, sugerirTalhao } from './relatorioBalanca';
import type { Talhao } from './tipos';

const talhoes: Talhao[] = [
  { id: 'cau1', nome: 'Talhão 1 - CAU', capim: '', areaHa: 50, fazenda: 'Caua' },
  { id: 'cau2a', nome: 'Talhão 2A - CAU', capim: '', areaHa: 102.8, fazenda: 'Caua' },
  { id: 'pd18a', nome: 'Talhão 18A - PD', capim: 'Miyagi', areaHa: 70.6, fazenda: 'Pedra' },
  { id: 'pd18b', nome: 'Talhão 18B - PD', capim: 'Miyagi', areaHa: 37.2, fazenda: 'Pedra' },
  { id: 'pd13', nome: 'Talhão 13 - PD', capim: 'Miyagi', areaHa: 63, fazenda: 'Pedra' },
];

describe('relatório da balança', () => {
  it('lê silo e talhão da observação', () => {
    expect(lerObs('TRINCHEIRA 01-CAU TALHÃO 02')).toEqual({ silo: 'Trincheira 1', textoTalhao: 'CAU TALHÃO 02' });
    expect(lerObs('MOT 1-TRINCHEIRA 01-CAU TALHÃO 02')).toEqual({ silo: 'Trincheira 1', textoTalhao: 'CAU TALHÃO 02' });
    expect(lerObs('TRINCHEIRA 3 - PD TALHAO 18 B')).toEqual({ silo: 'Trincheira 3', textoTalhao: 'PD TALHÃO 18B' });
    expect(lerObs('')).toEqual({ silo: '', textoTalhao: '' });
  });

  it('nome do motorista sem CPF; "SEM MOTORISTA" vira vazio', () => {
    expect(nomeMotorista('FERNANDO ALONSO 04161226128')).toBe('Fernando Alonso');
    expect(nomeMotorista('CLAUDINEI MARQUES ')).toBe('Claudinei Marques');
    expect(nomeMotorista('SEM MOTORISTA')).toBe('');
  });

  it('sugere o talhão: igual = exata; só parecido (02 → 2A) = conferir', () => {
    expect(sugerirTalhao('CAU TALHÃO 01', talhoes)).toEqual({ talhaoId: 'cau1', certeza: 'exata' });
    expect(sugerirTalhao('CAU TALHÃO 02', talhoes)).toEqual({ talhaoId: 'cau2a', certeza: 'conferir' });
    expect(sugerirTalhao('PD TALHÃO 18B', talhoes)).toEqual({ talhaoId: 'pd18b', certeza: 'exata' });
    expect(sugerirTalhao('PD TALHÃO 18', talhoes)).toBeNull(); // 18A e 18B: ambíguo
    expect(sugerirTalhao('PD TALHÃO 13', talhoes)).toEqual({ talhaoId: 'pd13', certeza: 'exata' });
    expect(sugerirTalhao('', talhoes)).toBeNull();
  });

  it('cabeçalho em qualquer linha; pesos e data/hora da pesagem cheia', () => {
    const utc = (a: number, m: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(a, m - 1, d, h, mi));
    const linhas = lerLinhasBalanca([
      ['Listagem de cargas'],
      ['NR_ROMANEIO', 'PLACATRANSPORTADOR', 'PESO_TOTAL', 'PESO_TARA', 'PESO_LIQUIDO', 'OBS', 'DATA_ENTRADA', 'HR_ENTRADA', 'NOMETRANSPORTADOR', 'MOTORISTA'],
      [3299, 'CPG0247', 15920, 10080, 5840, 'TRINCHEIRA 01-CAU TALHÃO 02', utc(2026, 11, 17), utc(1899, 12, 30, 18, 19), 'VITOR ALONSO', 'VITOR ALONSO'],
      [3304, 'CRY-4H95', null, 9620, 0, '', null, null, 'CLAUDINEI MARQUES ', 'SEM MOTORISTA'],
    ]);
    expect(linhas[0]).toMatchObject({ romaneio: '3299', placa: 'CPG0247', totalKg: 15920, taraKg: 10080, liquidoKg: 5840, pesadoEm: '2026-11-17T18:19', silo: 'Trincheira 1', textoTalhao: 'CAU TALHÃO 02', motoristaRelatorio: 'Vitor Alonso', completa: true });
    expect(linhas[1]).toMatchObject({ romaneio: '3304', placa: 'CRY4H95', completa: false, motoristaRelatorio: 'Claudinei Marques' });
    expect(() => lerLinhasBalanca([['A', 'B'], [1, 2]])).toThrow(/NR_ROMANEIO/);
  });

  // arquivo de exemplo na pasta info/ local (fora do repositório): sem ele, o teste é pulado
  const ARQUIVO = 'info/balanca/printListagemCargasFR_grid_20261118.xlsx';
  it.skipIf(!existsSync(ARQUIVO))('lê o relatório real de 18/11/2026', async () => {
    const b = readFileSync(ARQUIVO);
    const linhas = await lerXlsxBalanca(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    // o arquivo de exemplo cresce com novos romaneios: confere os conhecidos, não a contagem exata
    const por = new Map(linhas.map((l) => [l.romaneio, l]));
    const conhecidas = ['3299', '3300', '3301', '3302'].map((r) => por.get(r)!);
    expect(conhecidas.map((l) => [l.romaneio, l.placa, l.liquidoKg, l.pesadoEm, l.completa])).toEqual([
      ['3299', 'CPG0247', 5840, '2026-11-17T18:19', true],
      ['3300', 'IBY9G34', 9000, '2026-11-17T19:21', true],
      ['3301', 'CRY4H95', 8760, '2026-11-17T18:22', true],
      ['3302', 'BXF7877', 6620, '2026-11-17T19:22', true],
    ]);
    expect(conhecidas.every((l) => l.silo === 'Trincheira 1' && l.textoTalhao === 'CAU TALHÃO 02')).toBe(true);
    expect(por.get('3302')!.motoristaRelatorio).toBe('Fernando Alonso');
    // linha sem peso cheio (caminhão ainda não voltou) nunca fica completa — o arquivo muda, então vale para todas
    expect(linhas.filter((l) => l.totalKg == null).every((l) => !l.completa)).toBe(true);
    // completas sempre com líquido positivo
    expect(linhas.filter((l) => l.completa).every((l) => (l.liquidoKg ?? 0) > 0)).toBe(true);
  }, 30_000); // lê o arquivo real com o Excel: com os outros testes rodando juntos, passa de 5 s
});

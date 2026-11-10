// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { areaAnelM2, capimDaAtividade, chaveNome, chaveTalhao, lerKml, nomePadrao, sugerirCorrespondencias } from './kml';
import { areaDoKml } from './importarFazenda';
import { compararNomes } from './tipos';

const KML_MINIMO = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>CAPIM</name>
<Placemark><name>PD - TALHAO 17 A — CAPIM MOMBACA</name>
<description><![CDATA[<b>PD - TALHAO 17 A</b><br/>Fazenda: Faz. Pedra<br/>Área: 73.30 ha<br/><br/><b>Atividade hoje: CAPIM MOMBACA</b>]]></description>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-52.0,-19.0,0 -51.99,-19.0,0 -51.99,-19.01,0 -52.0,-19.01,0 -52.0,-19.0,0</coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark></Folder></Document></kml>`;

describe('kml', () => {
  it('lê nome, fazenda, área, atividade e calcula a área do polígono', () => {
    const [p] = lerKml(KML_MINIMO);
    expect(p.nomeLimpo).toBe('PD - TALHAO 17 A');
    expect(p.nomeApp).toBe('Talhão 17A - PD');
    expect(p.fazenda).toBe('Pedra');
    expect(p.areaDeclaradaHa).toBe(73.3);
    expect(p.capim).toBe('Mombaça');
    // quadrado de 0,01° × 0,01° a 19°S ≈ 1052 m × 1106 m ≈ 116 ha
    expect(p.areaCalculadaHa).toBeGreaterThan(112);
    expect(p.areaCalculadaHa).toBeLessThan(120);
  });

  it('área geodésica de anel degenerado é zero', () => {
    expect(areaAnelM2([[0, 0], [1, 1]])).toBe(0);
  });

  it('converte atividade em capim', () => {
    expect(capimDaAtividade('CAPIM MOMBACA / COMPOSTAGEM')).toBe('Mombaça');
    expect(capimDaAtividade('CAPIM MIYAGI / CAPIM MOMBACA')).toBe('Miyagi/Mombaça');
    expect(capimDaAtividade('CAPIM PIATÃ')).toBe('Piatã');
    expect(capimDaAtividade('SEM ATIVIDADE CADASTRADA')).toBe('');
  });

  it('normaliza nomes para comparação', () => {
    expect(chaveNome('PD - TALHAO 17 A — CAPIM MOMBACA')).toBe(chaveNome('TL 17A'));
    expect(chaveNome('PIVO 01 — CAPIM MIYAGI')).toBe(chaveNome('Pivô 1'));
    expect(chaveNome('CONF - TALHAO C3')).toBe(chaveNome('C3'));
    expect(chaveNome('PD- TALHÃO 17 D')).toBe('17D');
    expect(chaveNome('Talhão 17A - PD')).toBe('17A');
    expect(chaveNome('Pivô 1 - Conf')).toBe(chaveNome('PIVO 01'));
    expect(chaveNome('Talhão C3 - Conf')).toBe('C3');
    expect(chaveNome('Talhão 18 - PD')).toBe(chaveNome('TL 18'));
    // partes do mesmo talhão com capins diferentes não se confundem
    expect(chaveNome('Talhão 17A Miyagi - PD')).not.toBe(chaveNome('Talhão 17A Mombaça - PD'));
    expect(chaveNome('TL17B -MOMBAÇA')).toBe('17B');
  });

  it('chave do talhão ignora o capim escrito no nome', () => {
    expect(chaveTalhao('TL 18 MIYAGI')).toBe('18');
    expect(chaveTalhao('TL17A - MOMBAÇA')).toBe('17A');
    expect(chaveTalhao('Talhão 17A Miyagi - PD')).toBe('17A');
    expect(chaveTalhao('PD - TALHAO 13A — CAPIM MIYAGI')).toBe('13A');
  });

  it('área do KML: usa a declarada, salvo quando ficou velha após redesenho', () => {
    expect(areaDoKml({ areaDeclaradaHa: 118, areaCalculadaHa: 109 })).toBe(118);
    expect(areaDoKml({ areaDeclaradaHa: 73.3, areaCalculadaHa: 45.13 })).toBe(45.13);
    expect(areaDoKml({ areaDeclaradaHa: null, areaCalculadaHa: 28.449 })).toBe(28.45);
  });

  it('gera o nome no padrão "Talhão N - Fazenda"', () => {
    expect(nomePadrao('PD - TALHAO 18', 'Pedra')).toBe('Talhão 18 - PD');
    expect(nomePadrao('PD - TALHAO 17 A', 'Pedra')).toBe('Talhão 17A - PD');
    expect(nomePadrao('PD- TALHÃO 17 D', 'Pedra')).toBe('Talhão 17D - PD');
    expect(nomePadrao('CONF - TALHAO 21', 'Confinamento')).toBe('Talhão 21 - Conf');
    expect(nomePadrao('CONF - TALHAO C3', 'Confinamento')).toBe('Talhão C3 - Conf');
    expect(nomePadrao('PIVO 01', 'Confinamento')).toBe('Pivô 1 - Conf');
    expect(nomePadrao('SA - TALHAO 05A', 'Santo Antonio')).toBe('Talhão 5A - SA');
    expect(nomePadrao('TALHÃO 08- JIBOIA/ORIDIO', 'Jiboia/Vovo Oridio')).toBe('Talhão 8 - JI');
    // polígonos desenhados à mão no Google Earth
    expect(nomePadrao('TL 18 MIYAGI', 'Pedra')).toBe('Talhão 18 - PD');
    expect(nomePadrao('TL13B - MOMBAÇA', 'Pedra')).toBe('Talhão 13B - PD');
    expect(nomePadrao('TL17B -MOMBAÇA', 'Pedra', 'Mombaça')).toBe('Talhão 17B Mombaça - PD');
    expect(nomePadrao('PD - TALHAO 17 A', 'Pedra', 'Miyagi')).toBe('Talhão 17A Miyagi - PD');
  });

  it('ordena nomes em ordem natural', () => {
    const nomes = ['Talhão 20 - Conf', 'Talhão C3 - Conf', 'Talhão 17B - PD', 'Pivô 2 - Conf', 'Talhão 13 - PD', 'Talhão 17A - PD', 'Pivô 1 - Conf', 'Talhão 18 - PD'];
    expect([...nomes].sort(compararNomes)).toEqual([
      'Pivô 1 - Conf', 'Pivô 2 - Conf', 'Talhão 13 - PD', 'Talhão 17A - PD', 'Talhão 17B - PD', 'Talhão 18 - PD', 'Talhão 20 - Conf', 'Talhão C3 - Conf',
    ]);
  });
});

describe('KML embutido no app (public/talhoes-fazenda.kml)', () => {
  const polys = lerKml(readFileSync('public/talhoes-fazenda.kml', 'utf8')).filter((p) => p.capim);
  const por = (nomeApp: string) => polys.find((p) => p.nomeApp === nomeApp)!;

  it('lê 16 talhões com capim, com nomes distintos no padrão do app', () => {
    expect(polys.map((p) => p.nomeApp).sort(compararNomes)).toEqual([
      'Pivô 1 - Conf', 'Pivô 2 - Conf',
      'Talhão 13A - PD', 'Talhão 13B - PD',
      'Talhão 17A Miyagi - PD', 'Talhão 17A Mombaça - PD', 'Talhão 17B Miyagi - PD', 'Talhão 17B Mombaça - PD',
      'Talhão 17C - PD', 'Talhão 17D - PD', 'Talhão 17E - PD', 'Talhão 18 - PD',
      'Talhão 20 - Conf', 'Talhão 21 - Conf', 'Talhão 23 - Conf', 'Talhão C3 - Conf',
    ]);
  });

  it('capim vem do sufixo do nome ou da pasta, não da descrição desatualizada', () => {
    expect(por('Talhão 17A Miyagi - PD').capim).toBe('Miyagi'); // descrição ainda dizia MOMBACA
    expect(por('Talhão 17A Mombaça - PD').capim).toBe('Mombaça'); // sem descrição: pasta CAPIM MOMBACA
    expect(por('Talhão 13B - PD').capim).toBe('Mombaça');
    expect(por('Talhão 23 - Conf').capim).toBe('Mombaça');
  });

  it('polígono sem descrição herda a fazenda do vizinho; partes do mesmo capim se juntam', () => {
    expect(por('Talhão 13B - PD').fazenda).toBe('Pedra');
    expect(por('Talhão 17B Mombaça - PD').fazenda).toBe('Pedra');
    const t18 = por('Talhão 18 - PD');
    expect(t18.aneis).toHaveLength(5); // 4 do "PD - TALHAO 18" + "TL 18 MIYAGI"
    expect(t18.areaCalculadaHa).toBeCloseTo(109, 0);
    expect(t18.areaDeclaradaHa).toBe(118);
    expect(areaDoKml(t18)).toBe(118);
    expect(areaDoKml(por('Talhão 17A Miyagi - PD'))).toBeCloseTo(45.1, 1); // declarada (73,3) ficou velha
    expect(areaDoKml(por('Talhão 17C - PD'))).toBe(43);
  });
});

const ARQUIVO = 'info/Pedra_Atividades.kml';
describe.skipIf(!existsSync(ARQUIVO))('arquivo real da fazenda', () => {
  const polys = lerKml(readFileSync(ARQUIVO, 'utf8'));

  it('lê os 50 talhões e a área calculada bate com a declarada', () => {
    expect(polys).toHaveLength(50);
    const diffs = polys
      .filter((p) => p.areaDeclaradaHa)
      .map((p) => ({ nome: p.nomeLimpo, dif: (p.areaCalculadaHa / p.areaDeclaradaHa! - 1) * 100 }));
    console.table(
      polys.filter((p) => p.capim).map((p) => ({ nome: p.nomeLimpo, capim: p.capim, declarada: p.areaDeclaradaHa, calculada: +p.areaCalculadaHa.toFixed(2) })),
    );
    console.log('Diferenças > 5%:', diffs.filter((d) => Math.abs(d.dif) > 5).map((d) => `${d.nome}: ${d.dif.toFixed(1)}%`));
  });

  it('associa os nomes do pré-cadastro aos polígonos do KML', () => {
    const nomes = ['Pivô 1', 'Pivô 2', 'C3', 'TL 13', 'TL 17A', 'TL 17B', 'TL 17C', 'TL 17D', 'TL 17E', 'TL 18', 'TL 20', 'TL 21', 'TL 23', 'Cauã 1'];
    const m = sugerirCorrespondencias(polys, nomes.map((nome, i) => ({ id: String(i + 1), nome, capim: '', areaHa: 0 })));
    const porTalhao = new Map([...m].map(([pi, tid]) => [nomes[Number(tid) - 1], polys[pi].nomeLimpo]));
    console.log(Object.fromEntries(porTalhao));
    expect(porTalhao.get('TL 13')).toBe('PD - TALHAO 13');
    expect(porTalhao.get('Pivô 1')).toBe('PIVO 01');
    expect(porTalhao.get('TL 17D')).toBe('PD- TALHÃO 17 D');
    expect(porTalhao.size).toBe(13); // Cauã 1 não tem correspondência automática
  });
});

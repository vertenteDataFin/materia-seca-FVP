import { adicionarVeiculo, atualizarAmostraColheita, atualizarCarga, atualizarVeiculo, dadosAtuais } from './dados';
import { normalizarPlaca } from './colheita';
import type { Substituicao, Veiculo } from './tipos';

/**
 * Relação de veículos da silagem (planilha "RELAÇÃO DE VEÍCULOS SILAGEM.xlsx", versão de 19/11/2026).
 * O CPF da planilha não entra no app (dado pessoal que o app não usa).
 */
export const VEICULOS_INICIAIS: Omit<Veiculo, 'id'>[] = [
  { numero: 1, motorista: 'Vitor Alonso', placa: 'CPG0247' },
  { numero: 2, motorista: 'Fernando Alonso', placa: 'BXF7877' },
  { numero: 3, motorista: 'Joziclei Ancelmo', placa: 'IBY9G34' },
  { numero: 4, motorista: 'Claudinei Marques', placa: 'CRY4H95' },
  { numero: 5, motorista: 'Sebastião David', placa: 'CXJ7E24' },
  { numero: 6, motorista: 'Jonas Nogueira', placa: 'MUN2182' },
  { numero: 7, motorista: 'Luciano Bezerra', placa: 'IIX6E53' },
  { numero: 8, motorista: 'Paulo Cesar Meneses', placa: 'CKZ3D25' },
  { numero: 21, motorista: 'Luis Antonio Alonso', placa: 'GMS0C59' },
];

/** Placas corrigidas na planilha: o caminhão já cadastrado troca de placa em vez de virar outro caminhão. */
export const PLACAS_CORRIGIDAS: { de: string; para: string }[] = [
  { de: 'CHJ7E24', para: 'CXJ7E24' }, // Sebastião David (19/11/2026)
];

/** Veículo cadastrado com esta placa (comparação sem hífen/espaço e sem diferenciar maiúsculas). */
export function veiculoDaPlaca(veiculos: Veiculo[], placa?: string | null): Veiculo | undefined {
  const p = normalizarPlaca(placa);
  return p ? veiculos.find((v) => normalizarPlaca(v.placa) === p) : undefined;
}

/** Substituição do motorista que vale nesta data ("AAAA-MM-DD…"), se houver. */
export function substituicaoNaData(v: Pick<Veiculo, 'substituicoes'>, data?: string | null): Substituicao | undefined {
  const d = (data ?? '').slice(0, 10);
  return d ? (v.substituicoes ?? []).find((s) => s.de <= d && d <= s.ate) : undefined;
}

/** Motorista do caminhão nesta data: o substituto do período, ou o titular. */
export function motoristaNaData(v: Pick<Veiculo, 'motorista' | 'substituicoes'>, data?: string | null): string {
  return substituicaoNaData(v, data)?.motorista ?? v.motorista;
}

/**
 * Acerta o motorista das cargas e amostras de colheita do caminhão já registradas, conforme o
 * titular e as substituições. Só olha os registros dos períodos indicados. Devolve quantos mudaram.
 */
export function acertarMotoristas(v: Veiculo, periodos: { de: string; ate: string }[]): number {
  const { cargas, amostrasColheita } = dadosAtuais();
  const p = normalizarPlaca(v.placa);
  const noPeriodo = (data: string) => periodos.some((x) => x.de <= data.slice(0, 10) && data.slice(0, 10) <= x.ate);
  let n = 0;
  for (const c of cargas) {
    if (normalizarPlaca(c.placa) !== p || !noPeriodo(c.saidaEm)) continue;
    const m = motoristaNaData(v, c.saidaEm);
    if (c.motorista !== m) { atualizarCarga(c.id, { motorista: m }); n++; }
  }
  for (const a of amostrasColheita) {
    if (normalizarPlaca(a.placa) !== p || !noPeriodo(a.coletadaEm)) continue;
    const m = motoristaNaData(v, a.coletadaEm);
    if (a.motorista !== m) { atualizarAmostraColheita(a.id, { motorista: m }); n++; }
  }
  return n;
}

/** Placa válida: 7 caracteres (antiga ABC1234 ou Mercosul ABC1D23), já normalizada. */
export function placaValida(p: string): boolean {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);
}

/** Próximo nº de cadastro livre. */
export function proximoNumero(veiculos: Veiculo[]): number {
  return veiculos.reduce((m, v) => Math.max(m, v.numero ?? 0), 0) + 1;
}

/**
 * Lança os veículos da planilha que ainda não estão cadastrados (pela placa). Devolve quantos entraram.
 * Se o nº de cadastro da planilha já foi usado por outro caminhão (cadastrado à mão), usa o próximo livre.
 */
export function importarVeiculosIniciais(): number {
  const atuais: Veiculo[] = [...dadosAtuais().veiculos];
  let n = 0;
  for (const { de, para } of PLACAS_CORRIGIDAS) {
    const antigo = veiculoDaPlaca(atuais, de);
    if (!antigo || veiculoDaPlaca(atuais, para)) continue;
    atualizarVeiculo(antigo.id, { placa: para });
    atuais[atuais.indexOf(antigo)] = { ...antigo, placa: para };
    n++;
  }
  for (const v of VEICULOS_INICIAIS) {
    if (veiculoDaPlaca(atuais, v.placa)) continue;
    const numeroLivre = v.numero != null && !atuais.some((x) => x.numero === v.numero) ? v.numero : proximoNumero(atuais);
    const novo = { ...v, numero: numeroLivre };
    adicionarVeiculo(novo);
    atuais.push({ id: '', ...novo });
    n++;
  }
  return n;
}

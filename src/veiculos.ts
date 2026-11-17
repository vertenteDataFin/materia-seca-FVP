import { adicionarVeiculo, dadosAtuais } from './dados';
import { normalizarPlaca } from './colheita';
import type { Veiculo } from './tipos';

/** Relação de veículos da silagem (planilha "RELAÇÃO DE VEÍCULOS SILAGEM.xlsx"). */
export const VEICULOS_INICIAIS: Omit<Veiculo, 'id'>[] = [
  { numero: 1, motorista: 'Vitor Alonso', placa: 'CPG0247' },
  { numero: 2, motorista: 'Fernando Alonso', placa: 'BXF7877' },
  { numero: 3, motorista: 'Joziclei Ancelmo', placa: 'IBY9G34' },
];

/** Veículo cadastrado com esta placa (comparação sem hífen/espaço e sem diferenciar maiúsculas). */
export function veiculoDaPlaca(veiculos: Veiculo[], placa?: string | null): Veiculo | undefined {
  const p = normalizarPlaca(placa);
  return p ? veiculos.find((v) => normalizarPlaca(v.placa) === p) : undefined;
}

/** Placa válida: 7 caracteres (antiga ABC1234 ou Mercosul ABC1D23), já normalizada. */
export function placaValida(p: string): boolean {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);
}

/** Próximo nº de cadastro livre. */
export function proximoNumero(veiculos: Veiculo[]): number {
  return veiculos.reduce((m, v) => Math.max(m, v.numero ?? 0), 0) + 1;
}

/** Lança os veículos da planilha que ainda não estão cadastrados (pela placa). Devolve quantos entraram. */
export function importarVeiculosIniciais(): number {
  const atuais = dadosAtuais().veiculos;
  let n = 0;
  for (const v of VEICULOS_INICIAIS) {
    if (veiculoDaPlaca(atuais, v.placa)) continue;
    adicionarVeiculo(v);
    n++;
  }
  return n;
}

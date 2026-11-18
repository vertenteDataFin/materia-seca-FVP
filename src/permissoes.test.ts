import { describe, expect, it } from 'vitest';
import { permissoesDoPapel } from './permissoes';

describe('permissões', () => {
  it('importar o relatório da balança: só o e-mail autorizado (e com papel que pode lançar peso)', () => {
    expect(permissoesDoPapel('admin', 'marialauragcardoso@gmail.com').podeImportarBalanca).toBe(true);
    expect(permissoesDoPapel('admin', ' MariaLauraGCardoso@gmail.com ').podeImportarBalanca).toBe(true);
    expect(permissoesDoPapel('admin', 'maria.mesquita@fazendavertente.com.br').podeImportarBalanca).toBe(false);
    expect(permissoesDoPapel('balanceiro', 'balanca@fazenda.com.br').podeImportarBalanca).toBe(false);
    expect(permissoesDoPapel('operador', 'marialauragcardoso@gmail.com').podeImportarBalanca).toBe(false);
    expect(permissoesDoPapel('admin').podeImportarBalanca).toBe(false);
  });
});

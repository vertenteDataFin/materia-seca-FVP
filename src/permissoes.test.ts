import { describe, expect, it } from 'vitest';
import { permissoesDoPapel } from './permissoes';

describe('permissões', () => {
  it('importar o relatório da balança: só o e-mail autorizado (e com papel que pode lançar peso)', () => {
    expect(permissoesDoPapel('admin', 'marialauragcardoso@gmail.com').podeImportarBalanca).toBe(true);
    expect(permissoesDoPapel('admin', ' MariaLauraGCardoso@gmail.com ').podeImportarBalanca).toBe(true);
    expect(permissoesDoPapel('admin', 'outra.admin@fazenda.com.br').podeImportarBalanca).toBe(false);
    expect(permissoesDoPapel('balanceiro', 'balanca@fazenda.com.br').podeImportarBalanca).toBe(false);
    expect(permissoesDoPapel('operador', 'marialauragcardoso@gmail.com').podeImportarBalanca).toBe(false);
    expect(permissoesDoPapel('admin').podeImportarBalanca).toBe(false);
  });

  it('excluir carga pesada: só o e-mail autorizado', () => {
    expect(permissoesDoPapel('admin', 'marialauragcardoso@gmail.com').podeExcluirCargasPesadas).toBe(true);
    expect(permissoesDoPapel('admin', 'outra.admin@fazenda.com.br').podeExcluirCargasPesadas).toBe(false);
    expect(permissoesDoPapel('membro', 'tec@fazenda.com.br').podeExcluirCargasPesadas).toBe(false);
    expect(permissoesDoPapel('balanceiro', 'marialauragcardoso@gmail.com').podeExcluirCargasPesadas).toBe(false);
  });

  it('finalizar a colheita do talhão: só o e-mail autorizado', () => {
    expect(permissoesDoPapel('admin', 'marialauragcardoso@gmail.com').podeFinalizarColheita).toBe(true);
    expect(permissoesDoPapel('admin', 'outra.admin@fazenda.com.br').podeFinalizarColheita).toBe(false);
    expect(permissoesDoPapel('balanceiro', 'balanca@fazenda.com.br').podeFinalizarColheita).toBe(false);
    expect(permissoesDoPapel('membro', 'tec@fazenda.com.br').podeFinalizarColheita).toBe(false);
  });

  it('protótipo da coleta de campo: só o e-mail de teste vê', () => {
    expect(permissoesDoPapel('admin', 'marialauragcardoso@gmail.com').podeTestarPrototipo).toBe(true);
    expect(permissoesDoPapel('admin', 'outra.admin@fazenda.com.br').podeTestarPrototipo).toBe(false);
    expect(permissoesDoPapel('membro', 'tec@fazenda.com.br').podeTestarPrototipo).toBe(false);
    expect(permissoesDoPapel('admin').podeTestarPrototipo).toBe(false);
  });
});

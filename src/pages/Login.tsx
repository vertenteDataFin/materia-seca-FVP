import { useState, type FormEvent } from 'react';
import { criarConta, entrarComEmail, mensagemErroAuth, redefinirSenha } from '../sessao';

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function executar(acao: () => Promise<unknown>) {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      await acao();
    } catch (e) {
      setErro(mensagemErroAuth(e));
    } finally {
      setOcupado(false);
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return setErro('Informe e-mail e senha.');
    if (modo === 'criar') {
      if (!nome.trim()) return setErro('Informe seu nome.');
      if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');
      if (senha !== confirma) return setErro('As senhas não conferem.');
      return void executar(() => criarConta(nome, email, senha));
    }
    void executar(() => entrarComEmail(email, senha));
  }

  function esqueci() {
    if (!email.trim()) return setErro('Digite seu e-mail para receber o link de redefinição.');
    void executar(async () => {
      await redefinirSenha(email);
      setAviso(`Enviamos um link de redefinição de senha para ${email.trim()}.`);
    });
  }

  function trocar(m: 'entrar' | 'criar') {
    setModo(m);
    setErro('');
    setAviso('');
  }

  return (
    <main className="login">
      <div className="cartao login-cartao">
        <div className="marca login-marca">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={40} height={40} />
          <span>Silagem MS</span>
        </div>

        <div className="abas" role="tablist">
          <button type="button" role="tab" aria-selected={modo === 'entrar'} className={modo === 'entrar' ? 'ativa' : ''} onClick={() => trocar('entrar')}>Entrar</button>
          <button type="button" role="tab" aria-selected={modo === 'criar'} className={modo === 'criar' ? 'ativa' : ''} onClick={() => trocar('criar')}>Criar conta</button>
        </div>

        <p className="dica">
          {modo === 'entrar'
            ? 'Entre com o e-mail e a senha da sua conta. Os dados ficam sincronizados entre os aparelhos.'
            : 'Crie sua conta com e-mail e senha. Um administrador da fazenda precisa liberar o acesso antes de você ver os dados.'}
        </p>

        <form className="grade-form" onSubmit={enviar}>
          {modo === 'criar' && (
            <label className="largo">
              Nome
              <input autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
          )}
          <label className="largo">
            E-mail
            <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="largo">
            Senha
            <input type="password" autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          {modo === 'criar' && (
            <label className="largo">
              Confirmar senha
              <input type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
            </label>
          )}
          <div className="acoes largo">
            <button type="submit" className="primario" disabled={ocupado}>
              {ocupado ? 'Aguarde…' : modo === 'criar' ? 'Criar conta' : 'Entrar'}
            </button>
            {modo === 'entrar' && (
              <button type="button" className="link" onClick={esqueci} disabled={ocupado}>Esqueci a senha</button>
            )}
          </div>
        </form>

        {erro && <p className="erro">{erro}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
      </div>
    </main>
  );
}

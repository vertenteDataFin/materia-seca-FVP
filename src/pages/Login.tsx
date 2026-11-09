import { useState, type FormEvent } from 'react';
import { entrarComEmail, mensagemErroAuth, redefinirSenha } from '../sessao';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
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

  function porEmail(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return setErro('Informe e-mail e senha.');
    void executar(() => entrarComEmail(email, senha));
  }

  function esqueci() {
    if (!email.trim()) return setErro('Digite seu e-mail para receber o link de redefinição.');
    void executar(async () => {
      await redefinirSenha(email);
      setAviso(`Enviamos um link de redefinição de senha para ${email.trim()}.`);
    });
  }

  return (
    <main className="login">
      <div className="cartao login-cartao">
        <div className="marca login-marca">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={40} height={40} />
          <span>Silagem MS</span>
        </div>
        <p className="dica">Entre com o e-mail e a senha cadastrados pela fazenda. Os dados ficam sincronizados entre os aparelhos.</p>

        <form className="grade-form" onSubmit={porEmail}>
          <label className="largo">
            E-mail
            <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="largo">
            Senha
            <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          <div className="acoes largo">
            <button type="submit" className="primario" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
            <button type="button" className="link" onClick={esqueci} disabled={ocupado}>Esqueci a senha</button>
          </div>
        </form>

        {erro && <p className="erro">{erro}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
      </div>
    </main>
  );
}

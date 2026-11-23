import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { backend, isLocal } from "@/lib/backend";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { Logo } from "@/components/Layout";
import { useFeedback } from "@/components/feedback";
import { useAuth } from "@/hooks/useAuth";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-brand/10 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <Logo className="mb-8 justify-center text-xl" />
        <Card className="p-6">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </Card>
        {isLocal && <p className="mt-4 text-center text-[11px] text-amber-700">Prévia local — contas e dados ficam somente neste navegador.</p>}
      </div>
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} {...props} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await backend.auth.signIn(email.trim(), password);
      nav("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </Field>
        <Field label="Senha">
          <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Entrar
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/recuperar-senha" className="text-muted hover:text-ink">
            Esqueci a senha
          </Link>
          <Link to="/cadastro" className="font-semibold text-brand">
            Criar conta
          </Link>
        </div>
      </form>
    </Shell>
  );
}

export function Signup() {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "", sex: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const nav = useNavigate();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (form.password !== form.confirm) return setError("As senhas não coincidem.");
    setBusy(true);
    try {
      const r = await backend.auth.signUp(form.email.trim(), form.password, { full_name: form.full_name.trim(), sex: form.sex });
      if (r.needsConfirmation) setSent(true);
      else nav("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <Shell title="Confirme seu e-mail" subtitle={`Enviamos um link de confirmação para ${form.email}.`}>
        <MailCheck className="mx-auto my-4 h-12 w-12 text-brand" />
        <Link to="/login">
          <Button className="w-full">Ir para o login</Button>
        </Link>
      </Shell>
    );
  return (
    <Shell title="Criar conta" subtitle="Cada pessoa tem seu próprio ambiente, dados e metas.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome completo">
          <Input required value={form.full_name} onChange={set("full_name")} autoComplete="name" />
        </Field>
        <Field label="Sexo" hint="Usado para cálculos nutricionais e para configurar os módulos do app.">
          <Select required value={form.sex} onChange={set("sex")}>
            <option value="">Selecione</option>
            <option value="feminino">Feminino</option>
            <option value="masculino">Masculino</option>
            <option value="outro">Outro / prefiro não dizer</option>
          </Select>
        </Field>
        <Field label="E-mail">
          <Input type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres.">
          <PasswordInput required value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Field label="Confirmar senha">
          <PasswordInput required value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Criar conta
        </Button>
        <p className="text-center text-sm text-muted">
          Já tem conta?{" "}
          <Link to="/login" className="font-semibold text-brand">
            Entrar
          </Link>
        </p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await backend.auth.resetPassword(email.trim());
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {done ? (
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-brand" />
          <p className="text-sm text-muted">Se houver uma conta com {email}, você receberá o link em instantes.</p>
          <Link to="/login">
            <Button variant="secondary" className="w-full">
              Voltar ao login
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>
            Enviar link
          </Button>
          <Link to="/login" className="block text-center text-sm text-muted hover:text-ink">
            Voltar ao login
          </Link>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useFeedback();
  const { clearRecovery } = useAuth();
  const nav = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    setBusy(true);
    try {
      await backend.auth.updatePassword(pw);
      toast("Senha atualizada!");
      clearRecovery();
      nav("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Nova senha" subtitle="Defina sua nova senha de acesso.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha">
          <PasswordInput required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>
          Salvar nova senha
        </Button>
      </form>
    </Shell>
  );
}

import { useRef, useState } from "react";
import { Bell, Camera, Download, FileText, KeyRound, LogOut, Plus, Share2, Target, Trash2, UserCog } from "lucide-react";
import { backend, isClaude, isLocal } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import { useData } from "@/hooks/useData";
import type { NotificationRule, UserGoal } from "@/lib/types";
import { addDays, cn, compressImage, downloadFile, fmtDate, fmtNum, today, toCSV, toNum, weekStart, WEEKDAYS } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { ProfileForm } from "@/components/ProfileForm";
import { Badge, Button, Card, CardTitle, Field, Input, Modal, PageHeader, Select } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";
import { sumLogs } from "@/lib/nutrition";

export default function ProfilePage() {
  const { profile, updateProfile } = useAuth();
  const { toast, confirm } = useFeedback();
  const { busy, run } = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  if (!profile) return null;

  const uploadAvatar = (f: File) =>
    run("avatar", async () => {
      const blob = await compressImage(f, 512);
      const path = await backend.upload("avatars", `avatar-${Date.now()}.jpg`, blob);
      const old = profile.avatar_url;
      await updateProfile({ avatar_url: path });
      if (old) backend.removeFile("avatars", old).catch(() => undefined);
    }, "Foto de perfil atualizada.");

  return (
    <div className="space-y-5">
      <PageHeader title="Perfil" subtitle="Dados pessoais, metas, lembretes, privacidade e relatórios." />

      <Card className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <Avatar profile={profile} size={72} />
          <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 rounded-full bg-brand p-1.5 text-onbrand" aria-label="Alterar foto">
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{profile.full_name}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
          {busy === "avatar" && <p className="text-xs text-brand">Enviando foto…</p>}
        </div>
        {!isClaude && (
          <Button
            variant="secondary"
            onClick={async () => {
              if (await confirm({ title: "Sair da conta?", confirmLabel: "Sair" })) await backend.auth.signOut();
            }}
          >
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle icon={<UserCog className="h-4 w-4 text-brand" />}>Dados pessoais</CardTitle>
          <ProfileForm initial={profile} onSubmit={async (v) => { await updateProfile(v); toast("Perfil atualizado."); }} />
        </Card>
        <div className="space-y-5">
          <Card>
            <CardTitle>Aparência e módulos</CardTitle>
            <div className="mb-3 rounded-xl bg-surface2 p-3">
              <p className="text-sm font-medium">Cor de destaque</p>
              <div className="mt-2 flex gap-2">
                {([
                  ["verde", "Branco + verde", "#16a34a"],
                  ["vermelho", "Branco + vermelho", "#dc2626"],
                ] as const).map(([k, l, c]) => (
                  <button
                    key={k}
                    onClick={() => run("accent", () => updateProfile({ accent_color: k }))}
                    className={cn("flex flex-1 items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-sm", profile.accent_color === k ? "border-brand ring-2 ring-brand/20" : "border-line")}
                  >
                    <span className="h-4 w-4 rounded-full" style={{ background: c }} /> {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-surface2 p-3">
              <div>
                <p className="text-sm font-medium">Módulo de corrida</p>
                <p className="text-xs text-muted">Exibe a aba Corrida, metas e sugestões de corrida.</p>
              </div>
              <Toggle checked={profile.running_enabled} onChange={(c) => run("run", () => updateProfile({ running_enabled: c }), c ? "Corrida habilitada." : "Corrida ocultada.")} />
            </label>
          </Card>
          <GoalsCard />
          <RemindersCard />
        </div>
      </div>

      {isClaude ? <ClaudeSharingCard /> : <SharingCard />}
      <ReportsCard />
      {!isClaude && <SecurityCard />}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand" : "bg-line")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

const GOAL_TYPES: Record<string, { label: string; unit: string }> = {
  calorias: { label: "Calorias diárias", unit: "kcal" },
  agua: { label: "Água por dia", unit: "ml" },
  treinos_semana: { label: "Treinos por semana", unit: "treinos" },
  km_semana: { label: "Km de corrida por semana", unit: "km" },
  peso: { label: "Peso", unit: "kg" },
  personalizada: { label: "Personalizada", unit: "" },
};

function GoalsCard() {
  const { updateProfile } = useAuth();
  const { data, reload } = useData(() => backend.list<UserGoal>("user_goals", { eq: { active: true }, order: [["created_at", "desc"]] }), []);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ type: "treinos_semana", title: "", value: "" });
  const { busy, run } = useAction();
  return (
    <Card>
      <CardTitle icon={<Target className="h-4 w-4 text-brand" />} action={<Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Meta</Button>}>
        Metas
      </CardTitle>
      {!data?.length ? (
        <p className="text-sm text-muted">Defina metas diárias e semanais para acompanhar no painel.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((g) => (
            <li key={g.id} className="flex items-center justify-between rounded-xl bg-surface2 p-3 text-sm">
              <div>
                <p className="font-medium">{g.title}</p>
                <p className="text-xs text-muted">{GOAL_TYPES[g.type]?.label}</p>
              </div>
              <button
                className="text-muted hover:text-red-600"
                aria-label="Excluir meta"
                onClick={() =>
                  run("d", async () => {
                    await backend.remove("user_goals", g.id);
                    reload();
                  }, "Meta removida.")
                }
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova meta">
        <div className="space-y-3">
          <Field label="Tipo">
            <Select value={v.type} onChange={(e) => setV((p) => ({ ...p, type: e.target.value }))}>
              {Object.entries(GOAL_TYPES).map(([k, t]) => (
                <option key={k} value={k}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          {v.type !== "personalizada" && (
            <Field label={`Valor (${GOAL_TYPES[v.type].unit})`}>
              <Input inputMode="decimal" value={v.value} onChange={(e) => setV((p) => ({ ...p, value: e.target.value }))} />
            </Field>
          )}
          <Field label="Descrição">
            <Input value={v.title} onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))} placeholder="Ex.: Treinar 4x por semana" />
          </Field>
          <Button
            className="w-full"
            loading={busy === "c"}
            onClick={() =>
              run("c", async () => {
                const value = toNum(v.value);
                if (v.type !== "personalizada" && (value == null || value <= 0)) throw new Error("Informe um valor válido.");
                const t = GOAL_TYPES[v.type];
                await backend.insert("user_goals", { type: v.type, title: v.title.trim() || `${t.label}: ${fmtNum(value)} ${t.unit}`, target_value: value, unit: t.unit || null, active: true });
                if (v.type === "agua" && value) await updateProfile({ water_goal_ml: Math.round(value) });
                if (v.type === "peso" && value) await updateProfile({ goal_weight_kg: value });
                setOpen(false);
                setV({ type: "treinos_semana", title: "", value: "" });
                reload();
              }, "Meta criada.")
            }
          >
            Salvar meta
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

const REMINDER_KINDS: Record<string, string> = { refeicao: "Refeição", agua: "Água", treino: "Treino", corrida: "Corrida", medidas: "Medidas", personalizado: "Personalizado" };

function RemindersCard() {
  const { data, reload } = useData(() => backend.list<NotificationRule>("notifications", { order: [["time_of_day", "asc"]] }), []);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ kind: "agua", title: "Hora de beber água 💧", time: "10:00", weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const { busy, run } = useAction();
  const { toast } = useFeedback();
  const perm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const changed = () => {
    window.dispatchEvent(new Event("bfit:reminders-changed"));
    reload();
  };
  return (
    <Card>
      <CardTitle icon={<Bell className="h-4 w-4 text-brand" />} action={<Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Lembrete</Button>}>
        Notificações e lembretes
      </CardTitle>
      {perm === "default" && (
        <Button
          size="sm"
          variant="secondary"
          className="mb-3"
          onClick={async () => {
            const r = await Notification.requestPermission();
            toast(r === "granted" ? "Notificações ativadas." : "Permissão negada. Os lembretes aparecerão dentro do app.", r === "granted" ? "success" : "info");
          }}
        >
          Permitir notificações do navegador
        </Button>
      )}
      <p className="mb-3 text-[11px] text-muted">Os lembretes são exibidos enquanto o app estiver aberto (notificação do navegador ou aviso no app).</p>
      {!data?.length ? (
        <p className="text-sm text-muted">Nenhum lembrete configurado.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((n) => (
            <li key={n.id} className="flex items-center gap-3 rounded-xl bg-surface2 p-3 text-sm">
              <span className="font-mono text-base font-semibold">{n.time_of_day.slice(0, 5)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{n.title}</p>
                <p className="text-[11px] text-muted">{n.weekdays.length === 7 ? "Todos os dias" : n.weekdays.map((d) => WEEKDAYS[d]).join(", ")}</p>
              </div>
              <Toggle
                checked={n.enabled}
                onChange={(c) =>
                  run("t", async () => {
                    await backend.update("notifications", n.id, { enabled: c });
                    changed();
                  })
                }
              />
              <button
                className="text-muted hover:text-red-600"
                aria-label="Excluir lembrete"
                onClick={() =>
                  run("d", async () => {
                    await backend.remove("notifications", n.id);
                    changed();
                  }, "Lembrete removido.")
                }
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Novo lembrete">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={v.kind} onChange={(e) => setV((p) => ({ ...p, kind: e.target.value }))}>
                {Object.entries(REMINDER_KINDS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Horário">
              <Input type="time" value={v.time} onChange={(e) => setV((p) => ({ ...p, time: e.target.value }))} />
            </Field>
          </div>
          <Field label="Mensagem">
            <Input value={v.title} onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))} />
          </Field>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((w, i) => (
              <button
                key={w}
                onClick={() => setV({ ...v, weekdays: v.weekdays.includes(i) ? v.weekdays.filter((x) => x !== i) : [...v.weekdays, i].sort() })}
                className={cn("rounded-lg px-2.5 py-1.5 text-xs font-semibold", v.weekdays.includes(i) ? "bg-brand text-onbrand" : "bg-surface2 text-muted")}
              >
                {w}
              </button>
            ))}
          </div>
          <Button
            className="w-full"
            loading={busy === "c"}
            onClick={() =>
              run("c", async () => {
                if (!v.title.trim() || !v.time) throw new Error("Informe mensagem e horário.");
                if (!v.weekdays.length) throw new Error("Selecione ao menos um dia.");
                await backend.insert("notifications", { kind: v.kind, title: v.title.trim(), time_of_day: v.time, weekdays: v.weekdays, enabled: true });
                setOpen(false);
                changed();
              }, "Lembrete criado.")
            }
          >
            Salvar lembrete
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

const SCOPES: Record<string, string> = { evolucao: "Evolução (peso e medidas)", fotos: "Fotos de evolução", treinos: "Treinos de musculação", corrida: "Corridas", nutricao: "Nutrição" };

function SharingCard() {
  const { data, reload } = useData(() => backend.rpc<any[]>("shared_profiles", {}), []);
  const [email, setEmail] = useState("");
  const [scopes, setScopes] = useState<string[]>(["evolucao"]);
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  const outgoing = (data ?? []).filter((s) => s.direction === "outgoing");
  const incoming = (data ?? []).filter((s) => s.direction === "incoming");
  return (
    <Card>
      <CardTitle icon={<Share2 className="h-4 w-4 text-brand" />}>Compartilhamento autorizado</CardTitle>
      <p className="mb-4 text-sm text-muted">Por padrão seus dados são totalmente privados. Escolha exatamente o que outra conta pode visualizar (somente leitura). Você pode revogar a qualquer momento.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="E-mail da outra conta">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com" />
          </Field>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SCOPES).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setScopes(scopes.includes(k) ? scopes.filter((s) => s !== k) : [...scopes, k])}
                className={cn("rounded-full border px-3 py-1.5 text-xs", scopes.includes(k) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted")}
              >
                {l}
              </button>
            ))}
          </div>
          <Button
            loading={busy === "s"}
            onClick={async () => {
              if (!scopes.length) return;
              if (!(await confirm({ title: "Autorizar compartilhamento?", text: `${email} poderá visualizar: ${scopes.map((s) => SCOPES[s]).join(", ")}.`, confirmLabel: "Autorizar" }))) return;
              run("s", async () => {
                if (!email.trim()) throw new Error("Informe o e-mail.");
                await backend.rpc("share_with_email", { p_email: email.trim(), p_scopes: scopes });
                setEmail("");
                reload();
              }, "Compartilhamento autorizado.");
            }}
          >
            Autorizar
          </Button>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Você compartilha com</p>
          {outgoing.length === 0 && <p className="text-sm text-muted">Ninguém.</p>}
          {outgoing.map((s) => (
            <div key={s.share_id} className="flex items-start justify-between gap-2 rounded-xl bg-surface2 p-3 text-sm">
              <div>
                <p className="font-medium">{s.full_name || s.email}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.scopes.map((x: string) => (
                    <Badge key={x}>{SCOPES[x]}</Badge>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (await confirm({ title: "Revogar acesso?", text: `${s.full_name || s.email} não poderá mais ver seus dados.`, danger: true, confirmLabel: "Revogar" }))
                    run("r", async () => {
                      await backend.remove("data_shares", s.share_id);
                      reload();
                    }, "Acesso revogado.");
                }}
              >
                Revogar
              </Button>
            </div>
          ))}
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Compartilham com você</p>
          {incoming.length === 0 ? <p className="text-sm text-muted">Ninguém.</p> : <p className="text-sm text-muted">{incoming.map((s) => s.full_name || s.email).join(", ")} — veja em Compartilhados.</p>}
        </div>
      </div>
    </Card>
  );
}

function ClaudeSharingCard() {
  const { profile, refreshProfile } = useAuth();
  const [scopes, setScopes] = useState<string[]>((profile?.share_scopes) ?? []);
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  const saved: string[] = (profile?.share_scopes) ?? [];
  const changed = JSON.stringify([...scopes].sort()) !== JSON.stringify([...saved].sort());
  const save = async () => {
    if (scopes.length && !(await confirm({ title: "Compartilhar estes dados?", text: `Quem tem acesso a este app poderá ver (sem editar): ${scopes.map((s) => SCOPES[s]).join(", ")}.`, confirmLabel: "Compartilhar" })))
      return;
    await run("s", async () => {
      await backend.rpc("set_share_scopes", { p_scopes: scopes });
      await refreshProfile();
    }, scopes.length ? "Compartilhamento atualizado." : "Compartilhamento desativado.");
  };
  return (
    <Card>
      <CardTitle icon={<Share2 className="h-4 w-4 text-brand" />}>Compartilhamento autorizado</CardTitle>
      <p className="mb-4 text-sm text-muted">
        Seus dados ficam numa área privada da sua conta Claude: ninguém mais consegue ver, nem quem criou o app. Marque abaixo o que você quer mostrar, somente leitura, para as outras pessoas com acesso a este app. Dá para desmarcar quando quiser.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(SCOPES).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setScopes(scopes.includes(k) ? scopes.filter((s) => s !== k) : [...scopes, k])}
            className={cn("rounded-full border px-3 py-1.5 text-xs", scopes.includes(k) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted")}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={busy === "s"} disabled={!changed}>
          Salvar compartilhamento
        </Button>
        <span className="text-xs text-muted">{saved.length ? `Compartilhando: ${saved.map((s) => SCOPES[s]).join(", ")}` : "Nada compartilhado no momento."}</span>
      </div>
    </Card>
  );
}

const EXPORTS: { table: string; label: string; order: string }[] = [
  { table: "body_measurements", label: "Medidas corporais", order: "date" },
  { table: "workout_sessions", label: "Treinos realizados", order: "started_at" },
  { table: "workout_sets", label: "Séries e cargas", order: "created_at" },
  { table: "running_sessions", label: "Corridas", order: "date" },
  { table: "meal_logs", label: "Consumo alimentar", order: "date" },
  { table: "water_tracking", label: "Hidratação", order: "date" },
  { table: "daily_activity", label: "Histórico de atividades", order: "date" },
];

function ReportsCard() {
  const { profile } = useAuth();
  const { busy, run } = useAction();
  const [weekly, setWeekly] = useState(false);
  const exportOne = (t: (typeof EXPORTS)[number]) =>
    run(t.table, async () => {
      const rows = await backend.list(t.table, { order: [[t.order, "asc"]] });
      if (!rows.length) throw new Error("Não há registros para exportar.");
      await downloadFile(`bucurinhos-fit-${t.table}-${today()}.csv`, toCSV(rows));
    });
  const exportAll = () =>
    run("all", async () => {
      const tables = ["profiles", "user_goals", "nutrition_profiles", "meal_plans", "meals", "food_items", "meal_logs", "workout_plans", "workout_days", "exercises", "workout_sessions", "workout_sets", "running_sessions", "running_goals", "body_measurements", "progress_photos", "water_tracking", "daily_activity", "notifications"];
      const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const t of tables) out[t] = t === "profiles" ? [profile] : await backend.list(t, {});
      await downloadFile(`bucurinhos-fit-backup-${today()}.json`, JSON.stringify(out, null, 2), "application/json");
    });
  return (
    <Card>
      <CardTitle icon={<FileText className="h-4 w-4 text-brand" />}>Relatórios e exportação</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setWeekly(true)}>
          <FileText className="h-4 w-4" /> Resumo semanal
        </Button>
        {EXPORTS.map((t) => (
          <Button key={t.table} size="sm" variant="secondary" onClick={() => exportOne(t)} loading={busy === t.table}>
            <Download className="h-4 w-4" /> {t.label} (CSV)
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={exportAll} loading={busy === "all"}>
          <Download className="h-4 w-4" /> Todos os dados (JSON)
        </Button>
      </div>
      <WeeklySummary open={weekly} onClose={() => setWeekly(false)} />
    </Card>
  );
}

function WeeklySummary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const [ref, setRef] = useState(weekStart(today()));
  const end = addDays(ref, 6);
  const { data } = useData(async () => {
    if (!open) return null;
    const [sessions, runs, logs, water, ms] = await Promise.all([
      backend.list<any>("workout_sessions", { gte: { started_at: ref }, lte: { started_at: end + "T23:59:59.999Z" } }),
      profile?.running_enabled ? backend.list<any>("running_sessions", { eq: { status: "done" }, gte: { date: ref }, lte: { date: end } }) : Promise.resolve([]),
      backend.list<any>("meal_logs", { gte: { date: ref }, lte: { date: end } }),
      backend.list<any>("water_tracking", { gte: { date: ref }, lte: { date: end } }),
      backend.list<any>("body_measurements", { lte: { date: end }, order: [["date", "asc"]] }),
    ]);
    return { sessions: sessions.filter((s: any) => s.finished_at), runs, logs, water, ms };
  }, [open, ref]);
  if (!open) return null;
  const w = (data?.ms ?? []).filter((m: any) => m.weight_kg != null);
  const inWeek = w.filter((m: any) => m.date >= ref);
  const before = w.filter((m: any) => m.date < ref).slice(-1)[0];
  const last = inWeek[inWeek.length - 1];
  const days = new Set((data?.logs ?? []).map((l: any) => l.date)).size || 1;
  const kcal = sumLogs(data?.logs ?? []).calories;
  return (
    <Modal open onClose={onClose} title="Resumo semanal" wide>
      <div className="space-y-4" id="weekly-report">
        <div className="no-print flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setRef(addDays(ref, -7))}>
            ← Anterior
          </Button>
          <span className="flex-1 text-center text-sm font-semibold">
            {fmtDate(ref)} – {fmtDate(end)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setRef(addDays(ref, 7))} disabled={end >= today()}>
            Próxima →
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SumBox label="Treinos de musculação" value={`${data?.sessions.length ?? 0}`} />
          {profile?.running_enabled && <SumBox label="Corrida" value={`${fmtNum((data?.runs ?? []).reduce((a: number, r: any) => a + Number(r.distance_km), 0), 1)} km`} sub={`${data?.runs.length ?? 0} corridas`} />}
          <SumBox label="Média de calorias registradas" value={`${fmtNum(kcal / days)} kcal`} sub={`${new Set((data?.logs ?? []).map((l: any) => l.date)).size} dias com registro`} />
          <SumBox label="Água (média/dia)" value={`${fmtNum((data?.water ?? []).reduce((a: number, x: any) => a + x.amount_ml, 0) / 7 / 1000, 2)} L`} />
          <SumBox label="Peso no fim da semana" value={last ? `${fmtNum(last.weight_kg, 1)} kg` : "—"} sub={last && before ? `${last.weight_kg - before.weight_kg > 0 ? "+" : ""}${fmtNum(last.weight_kg - before.weight_kg, 1)} kg vs semana anterior` : undefined} />
        </div>
        {!isClaude && (
          <Button className="no-print w-full" variant="secondary" onClick={() => window.print()}>
            Imprimir / salvar em PDF
          </Button>
        )}
      </div>
    </Modal>
  );
}

function SumBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface2 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function SecurityCard() {
  const [pw, setPw] = useState("");
  const { busy, run } = useAction();
  return (
    <Card>
      <CardTitle icon={<KeyRound className="h-4 w-4 text-brand" />}>Segurança</CardTitle>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nova senha" className="min-w-[220px] flex-1">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button
          loading={busy === "pw"}
          onClick={() =>
            run("pw", async () => {
              if (pw.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
              await backend.auth.updatePassword(pw);
              setPw("");
            }, "Senha alterada.")
          }
        >
          Alterar senha
        </Button>
      </div>
      {isLocal && <p className="mt-2 text-[11px] text-muted">Prévia local: dados e senhas ficam apenas neste navegador.</p>}
    </Card>
  );
}

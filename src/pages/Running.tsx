import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Footprints, Medal, Pencil, Plus, Target, Trash2, Trophy } from "lucide-react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { backend } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import { logActivity, useData } from "@/hooks/useData";
import type { RunningGoal, RunningSession } from "@/lib/types";
import { cn, fmtDate, fmtDuration, fmtNum, fmtPace, parseDuration, RUN_TYPES, toNum, today, weekStart, WEEKDAYS } from "@/lib/utils";
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Modal, PageHeader, PageLoader, Progress, Select, Tabs, Textarea } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";
import { AreaTrend, BarTrend } from "@/components/charts";

type Tab = "corridas" | "graficos" | "metas" | "calendario";

export default function Running() {
  const [tab, setTab] = useState<Tab>("corridas");
  const { data: runs, loading, reload } = useData(() => backend.list<RunningSession>("running_sessions", { order: [["date", "desc"], ["created_at", "desc"]] }), []);
  const [edit, setEdit] = useState<Partial<RunningSession> | null>(null);
  if (loading) return <PageLoader />;
  const all = runs ?? [];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Corrida"
        subtitle="Registre treinos, acompanhe pace e volume e persiga suas metas."
        action={
          <Button onClick={() => setEdit({ date: today(), status: "done", type: "leve" })}>
            <Plus className="h-4 w-4" /> Registrar corrida
          </Button>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "corridas", label: "Corridas" },
          { value: "graficos", label: "Gráficos e recordes" },
          { value: "metas", label: "Metas" },
          { value: "calendario", label: "Calendário" },
        ]}
      />
      {tab === "corridas" && <RunList runs={all} onEdit={setEdit} reload={reload} />}
      {tab === "graficos" && <Charts runs={all.filter((r) => r.status === "done")} />}
      {tab === "metas" && <Goals runs={all.filter((r) => r.status === "done")} />}
      {tab === "calendario" && <RunCalendar runs={all} onEdit={setEdit} />}
      <RunModal run={edit} onClose={() => setEdit(null)} onSaved={reload} />
    </div>
  );
}

function summary(runs: RunningSession[]) {
  const done = runs.filter((r) => r.status === "done");
  const ws = weekStart(today());
  const month = today().slice(0, 7);
  const km = (xs: RunningSession[]) => xs.reduce((a, r) => a + Number(r.distance_km), 0);
  return { week: km(done.filter((r) => r.date >= ws)), month: km(done.filter((r) => r.date.startsWith(month))), total: km(done), count: done.length };
}

function RunList({ runs, onEdit, reload }: { runs: RunningSession[]; onEdit: (r: Partial<RunningSession>) => void; reload: () => void }) {
  const { run } = useAction();
  const { confirm } = useFeedback();
  const [filter, setFilter] = useState("");
  const s = summary(runs);
  const planned = runs.filter((r) => r.status === "planned" && r.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const done = runs.filter((r) => r.status === "done" && (!filter || r.type === filter));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted">Esta semana</p>
          <p className="text-2xl font-bold">{fmtNum(s.week, 1)} km</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Este mês</p>
          <p className="text-2xl font-bold">{fmtNum(s.month, 1)} km</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Total</p>
          <p className="text-2xl font-bold">{fmtNum(s.total, 1)} km</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Corridas</p>
          <p className="text-2xl font-bold">{s.count}</p>
        </Card>
      </div>

      {planned.length > 0 && (
        <Card>
          <CardTitle icon={<CalendarDays className="h-4 w-4 text-brand" />}>Próximos treinos planejados</CardTitle>
          <ul className="space-y-2">
            {planned.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl bg-surface2 p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {RUN_TYPES[r.type]} · {fmtNum(r.distance_km, 1)} km
                  </p>
                  <p className="text-xs text-muted">
                    {fmtDate(r.date, "EEE, dd/MM")} {r.notes && `· ${r.notes}`}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onEdit({ ...r, status: "done" })}>
                  Registrar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Histórico</h2>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto">
          <option value="">Todos os tipos</option>
          {Object.entries(RUN_TYPES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      {!done.length ? (
        <Empty icon={<Footprints className="h-8 w-8" />} title="Nenhuma corrida registrada" text="Registre sua primeira corrida para ver gráficos, recordes e evolução." />
      ) : (
        <div className="space-y-2">
          {done.map((r) => (
            <Card key={r.id} className="flex items-center gap-3 p-3 sm:p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Footprints className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{fmtNum(r.distance_km, 2)} km</p>
                  <Badge>{RUN_TYPES[r.type]}</Badge>
                  {r.source !== "manual" && <Badge tone="brand">{r.source}</Badge>}
                </div>
                <p className="text-xs text-muted">
                  {fmtDate(r.date)} · {fmtDuration(r.duration_seconds)} · {fmtPace(r.pace_seconds_per_km)}
                  {r.avg_heart_rate ? ` · ${r.avg_heart_rate} bpm` : ""}
                  {r.calories ? ` · ${r.calories} kcal` : ""}
                </p>
                {r.notes && <p className="truncate text-xs text-muted">{r.notes}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => onEdit(r)} aria-label="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Excluir"
                onClick={async () => {
                  if (await confirm({ title: "Excluir corrida?", text: `${fmtNum(r.distance_km, 2)} km em ${fmtDate(r.date)}`, danger: true, confirmLabel: "Excluir" }))
                    run("d", async () => {
                      await backend.remove("running_sessions", r.id);
                      reload();
                    }, "Corrida excluída.");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RunModal({ run: initial, onClose, onSaved }: { run: Partial<RunningSession> | null; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [v, setV] = useState({ date: "", status: "done", type: "leve", distance: "", duration: "", hr: "", calories: "", notes: "" });
  const { busy, run } = useAction();
  useEffect(() => {
    if (!initial) return;
    setV({
      date: initial.date ?? today(),
      status: initial.status ?? "done",
      type: initial.type ?? "leve",
      distance: initial.distance_km?.toString() ?? "",
      duration: initial.duration_seconds ? fmtDuration(initial.duration_seconds) : "",
      hr: initial.avg_heart_rate?.toString() ?? "",
      calories: initial.calories?.toString() ?? "",
      notes: initial.notes ?? "",
    });
  }, [initial]);
  if (!initial) return null;
  const dist = toNum(v.distance);
  const dur = v.duration ? parseDuration(v.duration) : null;
  const pace = dist && dur ? Math.round(dur / dist) : null;
  const estKcal = dist && profile?.weight_kg ? Math.round(dist * profile.weight_kg * 1.0) : null;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const save = () =>
    run("s", async () => {
      if (!v.date) throw new Error("Informe a data.");
      if (!dist || dist <= 0 || dist > 400) throw new Error("Informe uma distância válida em km.");
      if (v.status === "done" && v.duration && dur == null) throw new Error("Tempo inválido. Use o formato hh:mm:ss ou mm:ss.");
      const hr = toNum(v.hr);
      if (hr != null && (hr < 30 || hr > 250)) throw new Error("Frequência cardíaca deve estar entre 30 e 250 bpm.");
      const payload = {
        date: v.date,
        status: v.status,
        type: v.type,
        distance_km: dist,
        duration_seconds: dur,
        pace_seconds_per_km: pace,
        avg_heart_rate: hr != null ? Math.round(hr) : null,
        calories: toNum(v.calories) != null ? Math.round(toNum(v.calories)!) : v.status === "done" ? estKcal : null,
        notes: v.notes.trim() || null,
      };
      if (initial.id) await backend.update("running_sessions", initial.id, payload);
      else await backend.insert("running_sessions", { ...payload, source: "manual" });
      if (v.status === "done" && (!initial.id || initial.status !== "done"))
        logActivity("corrida", `Corrida de ${fmtNum(dist, 1)} km (${RUN_TYPES[v.type]})`, { date: v.date, details: { distance_km: dist, pace } });
      onClose();
      onSaved();
    }, "Corrida salva.");
  return (
    <Modal open onClose={onClose} title={initial.id ? "Editar corrida" : "Registrar corrida"}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <Input type="date" value={v.date} onChange={set("date")} />
        </Field>
        <Field label="Situação">
          <Select value={v.status} onChange={set("status")}>
            <option value="done">Realizada</option>
            <option value="planned">Planejada</option>
          </Select>
        </Field>
        <Field label="Tipo de treino" className="col-span-2">
          <Select value={v.type} onChange={set("type")}>
            {Object.entries(RUN_TYPES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Distância (km)">
          <Input inputMode="decimal" value={v.distance} onChange={set("distance")} placeholder="5,0" />
        </Field>
        <Field label="Tempo total" hint="hh:mm:ss ou mm:ss">
          <Input value={v.duration} onChange={set("duration")} placeholder="28:30" />
        </Field>
        <div className="col-span-2 rounded-xl bg-surface2 p-3 text-sm">
          Pace médio: <span className="font-semibold text-brand">{fmtPace(pace)}</span>
        </div>
        <Field label="FC média (bpm)">
          <Input inputMode="numeric" value={v.hr} onChange={set("hr")} placeholder="opcional" />
        </Field>
        <Field label="Calorias" hint={estKcal ? `Estimativa: ~${estKcal} kcal` : undefined}>
          <Input inputMode="numeric" value={v.calories} onChange={set("calories")} placeholder={estKcal ? String(estKcal) : "opcional"} />
        </Field>
        <Field label="Observações" className="col-span-2">
          <Textarea value={v.notes} onChange={set("notes")} rows={2} />
        </Field>
      </div>
      <Button className="mt-5 w-full" onClick={save} loading={busy === "s"}>
        Salvar
      </Button>
    </Modal>
  );
}

function Charts({ runs }: { runs: RunningSession[] }) {
  if (!runs.length) return <Empty icon={<Footprints className="h-8 w-8" />} title="Sem dados para gráficos" text="Registre corridas realizadas para ver sua evolução." />;
  const asc = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  const byWeek: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const durByWeek: Record<string, number> = {};
  for (const r of asc) {
    const w = weekStart(r.date);
    byWeek[w] = (byWeek[w] ?? 0) + Number(r.distance_km);
    durByWeek[w] = (durByWeek[w] ?? 0) + (r.duration_seconds ?? 0);
    const m = r.date.slice(0, 7);
    byMonth[m] = (byMonth[m] ?? 0) + Number(r.distance_km);
  }
  const weekData = Object.entries(byWeek).slice(-12).map(([w, km]) => ({ w: fmtDate(w, "dd/MM"), km: Math.round(km * 10) / 10 }));
  const monthData = Object.entries(byMonth).slice(-12).map(([m, km]) => ({ m: format(new Date(m + "-01T12:00"), "MMM/yy", { locale: ptBR }), km: Math.round(km * 10) / 10 }));
  const timeData = Object.entries(durByWeek).slice(-12).map(([w, s]) => ({ w: fmtDate(w, "dd/MM"), min: Math.round(s / 60) }));
  const paceData = asc.filter((r) => r.pace_seconds_per_km).map((r) => ({ d: fmtDate(r.date, "dd/MM"), pace: r.pace_seconds_per_km! }));
  const distData = asc.map((r) => ({ d: fmtDate(r.date, "dd/MM"), km: Number(r.distance_km) }));

  const withPace = asc.filter((r) => r.pace_seconds_per_km && r.duration_seconds);
  const longest = asc.reduce((a, r) => (Number(r.distance_km) > Number(a.distance_km) ? r : a), asc[0]);
  const fastest = withPace.reduce<RunningSession | null>((a, r) => (!a || r.pace_seconds_per_km! < a.pace_seconds_per_km! ? r : a), null);
  const prFor = (km: number) => {
    const c = withPace.filter((r) => Number(r.distance_km) >= km);
    if (!c.length) return null;
    const best = c.reduce((a, r) => (r.pace_seconds_per_km! < a.pace_seconds_per_km! ? r : a));
    return { time: best.pace_seconds_per_km! * km, date: best.date, exact: Math.abs(Number(best.distance_km) - km) < 0.15 };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<Trophy className="h-4 w-4 text-brand" />}>Recordes pessoais</CardTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <PR label="Maior distância" value={`${fmtNum(longest.distance_km, 2)} km`} date={longest.date} />
          <PR label="Melhor pace" value={fastest ? fmtPace(fastest.pace_seconds_per_km) : "—"} date={fastest?.date} />
          {[5, 10, 21.1, 42.2].map((k) => {
            const p = prFor(k);
            return <PR key={k} label={`${k === 21.1 ? "21 km" : k === 42.2 ? "42 km" : `${k} km`}`} value={p ? fmtDuration(Math.round(p.time)) : "—"} date={p?.date} note={p && !p.exact ? "estimado pelo pace" : undefined} />;
          })}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Quilômetros por semana</CardTitle>
          <BarTrend data={weekData} x="w" y="km" unit="km" name="Distância" />
        </Card>
        <Card>
          <CardTitle>Quilômetros por mês</CardTitle>
          <BarTrend data={monthData} x="m" y="km" unit="km" name="Distância" />
        </Card>
        <Card>
          <CardTitle>Pace médio por corrida</CardTitle>
          {paceData.length > 1 ? <AreaTrend data={paceData} x="d" y="pace" name="Pace" formatter={(v) => fmtPace(v).replace("/km", "")} /> : <p className="py-10 text-center text-sm text-muted">Registre tempo nas corridas para ver o pace.</p>}
        </Card>
        <Card>
          <CardTitle>Tempo total por semana</CardTitle>
          <BarTrend data={timeData} x="w" y="min" unit="min" name="Tempo" />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Evolução da distância</CardTitle>
          <AreaTrend data={distData} x="d" y="km" unit="km" name="Distância" />
        </Card>
      </div>
    </div>
  );
}

function PR({ label, value, date, note }: { label: string; value: string; date?: string; note?: string }) {
  return (
    <div className="rounded-xl bg-surface2 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted">{date ? fmtDate(date) : "—"}</p>
      {note && <p className="text-[10px] text-amber-700/70">{note}</p>}
    </div>
  );
}

const PRESETS = [
  { title: "Correr 5 km", km: 5 },
  { title: "Correr 10 km", km: 10 },
  { title: "Correr 21 km (meia maratona)", km: 21.1 },
  { title: "Correr 42 km (maratona)", km: 42.2 },
];

function Goals({ runs }: { runs: RunningSession[] }) {
  const { data, loading, reload } = useData(() => backend.list<RunningGoal>("running_goals", { order: [["created_at", "desc"]] }), []);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: "", km: "", time: "", date: "" });
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  const longest = useMemo(() => Math.max(0, ...runs.map((r) => Number(r.distance_km))), [runs]);

  // Marca metas como atingidas automaticamente
  useEffect(() => {
    for (const g of data ?? []) {
      if (g.achieved_at) continue;
      const hit = runs.find((r) => Number(r.distance_km) >= Number(g.target_km) && (!g.target_time_seconds || (r.pace_seconds_per_km && r.pace_seconds_per_km * Number(g.target_km) <= g.target_time_seconds)));
      if (hit)
        backend.update("running_goals", g.id, { achieved_at: new Date(hit.date + "T12:00").toISOString() }).then(() => {
          logActivity("corrida", `Meta atingida: ${g.title} 🏅`);
          reload();
        });
    }
  }, [data, runs, reload]);

  const create = (preset?: { title: string; km: number }) =>
    run("c", async () => {
      const km = preset?.km ?? toNum(v.km);
      if (!km || km <= 0) throw new Error("Informe a distância da meta.");
      const time = v.time ? parseDuration(v.time) : null;
      if (v.time && time == null) throw new Error("Tempo alvo inválido.");
      await backend.insert("running_goals", { title: preset?.title ?? (v.title.trim() || `Correr ${km} km`), target_km: km, target_time_seconds: preset ? null : time, target_date: preset ? null : v.date || null });
      setOpen(false);
      setV({ title: "", km: "", time: "", date: "" });
      reload();
    }, "Meta criada.");

  if (loading) return <PageLoader />;
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<Target className="h-4 w-4 text-brand" />} action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Meta personalizada</Button>}>
          Adicionar meta
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.km} size="sm" variant="secondary" onClick={() => create(p)} disabled={data?.some((g) => g.target_km === p.km && !g.target_time_seconds)}>
              {p.title}
            </Button>
          ))}
        </div>
      </Card>
      {!data?.length ? (
        <Empty icon={<Medal className="h-8 w-8" />} title="Nenhuma meta ainda" text="Escolha uma distância acima ou crie uma meta personalizada." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((g) => (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{g.title}</p>
                  <p className="text-xs text-muted">
                    {fmtNum(g.target_km, 1)} km{g.target_time_seconds ? ` em ${fmtDuration(g.target_time_seconds)}` : ""}
                    {g.target_date ? ` · até ${fmtDate(g.target_date)}` : ""}
                  </p>
                </div>
                {g.achieved_at ? <Badge tone="brand">🏅 Atingida</Badge> : <Badge>Em andamento</Badge>}
              </div>
              <Progress value={Math.min(longest, g.target_km)} max={g.target_km} className="mt-3" />
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>Maior distância: {fmtNum(longest, 1)} km</span>
                <button
                  className="hover:text-red-600"
                  onClick={async () => {
                    if (await confirm({ title: "Excluir meta?", text: g.title, danger: true, confirmLabel: "Excluir" }))
                      run("d", async () => {
                        await backend.remove("running_goals", g.id);
                        reload();
                      });
                  }}
                >
                  Excluir
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Meta personalizada">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Título" className="col-span-2">
            <Input value={v.title} onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))} placeholder="Ex.: 10 km abaixo de 55 min" />
          </Field>
          <Field label="Distância (km)">
            <Input inputMode="decimal" value={v.km} onChange={(e) => setV((p) => ({ ...p, km: e.target.value }))} />
          </Field>
          <Field label="Tempo alvo (opcional)" hint="hh:mm:ss">
            <Input value={v.time} onChange={(e) => setV((p) => ({ ...p, time: e.target.value }))} />
          </Field>
          <Field label="Data alvo (opcional)" className="col-span-2">
            <Input type="date" value={v.date} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} />
          </Field>
        </div>
        <Button className="mt-5 w-full" onClick={() => create()} loading={busy === "c"}>
          Criar meta
        </Button>
      </Modal>
    </div>
  );
}

function RunCalendar({ runs, onEdit }: { runs: RunningSession[]; onEdit: (r: Partial<RunningSession>) => void }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const end = endOfMonth(month);
  const cells: Date[] = [];
  for (let d = new Date(start); d <= end || cells.length % 7; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <Button size="icon" variant="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <p className="font-semibold capitalize">{format(month, "MMMM yyyy", { locale: ptBR })}</p>
        <Button size="icon" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {[1, 2, 3, 4, 5, 6, 0].map((i) => (
          <div key={i}>{WEEKDAYS[i]}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const iso = today(d);
          const rs = runs.filter((r) => r.date === iso);
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <button
              key={iso}
              onClick={() => (rs[0] ? onEdit(rs[0]) : onEdit({ date: iso, status: iso > today() ? "planned" : "done", type: "leve" }))}
              className={cn("flex min-h-[64px] flex-col items-start rounded-xl border p-1.5 text-left text-xs transition hover:border-brand/40", inMonth ? "border-line bg-surface2" : "border-transparent opacity-40", iso === today() && "border-brand/60")}
            >
              <span className="text-muted">{d.getDate()}</span>
              {rs.map((r) => (
                <span key={r.id} className={cn("mt-0.5 w-full truncate rounded px-1 text-[10px] font-semibold", r.status === "done" ? "bg-brand text-onbrand" : "border border-dashed border-brand/60 text-brand")}>
                  {fmtNum(r.distance_km, 1)}k
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-brand" /> Realizada
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded border border-dashed border-brand" /> Planejada
        </span>
      </div>
    </Card>
  );
}

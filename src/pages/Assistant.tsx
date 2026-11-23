import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bot, Check, Dumbbell, Footprints, MessageSquare, Send, X } from "lucide-react";
import { backend, isLocal } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import { logActivity, useData } from "@/hooks/useData";
import type { AIInteraction, LibraryItem, WorkoutPlan } from "@/lib/types";
import { cn, fmtDate, fmtNum, RUN_TYPES, WEEKDAYS } from "@/lib/utils";
import { Badge, Button, Card, CardTitle, Disclaimer, Empty, Field, Input, PageHeader, PageLoader, Select, Tabs, Textarea } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";

type Tab = "musculacao" | "corrida" | "perguntas";

const DISCLAIMER = "As sugestões do assistente são educativas e não constituem prescrição médica nem garantia de resultados. Em caso de dor, lesão ou condição de saúde, consulte um profissional.";

export default function Assistant() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("musculacao");
  const { data, loading, reload } = useData(() => backend.list<AIInteraction>("ai_interactions", { in: { kind: ["musculacao", "corrida", "chat"] }, order: [["created_at", "desc"]], limit: 40 }), []);
  const items: { value: Tab; label: string }[] = [
    { value: "musculacao", label: "Musculação" },
    ...(profile?.running_enabled ? [{ value: "corrida" as Tab, label: "Corrida" }] : []),
    { value: "perguntas", label: "Perguntas" },
  ];
  const pending = (data ?? []).filter((i) => i.status === "pending" && (i.kind !== "corrida" || profile?.running_enabled));
  return (
    <div className="space-y-5">
      <PageHeader title="Assistente IA" subtitle="Sugestões de treino progressivas, baseadas no seu histórico. Você revisa e aprova antes de entrar na agenda." />
      {isLocal && <Disclaimer>Na prévia local a IA não é executada. Com o app conectado ao Supabase/Lovable Cloud, as sugestões são geradas por uma Edge Function segura.</Disclaimer>}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Aguardando sua aprovação</h2>
          {pending.map((i) => (
            <SuggestionCard key={i.id} item={i} onDone={reload} />
          ))}
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} items={items} />
      {tab === "musculacao" && <StrengthForm onCreated={reload} />}
      {tab === "corrida" && profile?.running_enabled && <RunningForm onCreated={reload} />}
      {tab === "perguntas" && <Chat items={(data ?? []).filter((i) => i.kind === "chat")} loading={loading} onAsked={reload} />}
      {!loading && (data ?? []).some((i) => i.kind !== "chat" && i.status !== "pending") && (
        <Card>
          <CardTitle>Sugestões anteriores</CardTitle>
          <ul className="divide-y divide-line text-sm">
            {(data ?? [])
              .filter((i) => i.kind !== "chat" && i.status !== "pending")
              .map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span>{i.response?.title ?? i.kind}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {fmtDate(i.created_at.slice(0, 10))}
                    <Badge tone={i.status === "approved" ? "brand" : "default"}>{i.status === "approved" ? "Aprovada" : "Rejeitada"}</Badge>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
      <Disclaimer>{DISCLAIMER}</Disclaimer>
    </div>
  );
}

function StrengthForm({ onCreated }: { onCreated: () => void }) {
  const [v, setV] = useState({ experience: "iniciante", days_per_week: "3", goal: "", focus: "", notes: "" });
  const { busy, run } = useAction();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Card>
      <CardTitle icon={<Dumbbell className="h-4 w-4 text-brand" />}>Sugestão de divisão de musculação</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Experiência">
          <Select value={v.experience} onChange={set("experience")}>
            <option value="iniciante">Iniciante (menos de 6 meses)</option>
            <option value="intermediario">Intermediário (6 meses a 2 anos)</option>
            <option value="avancado">Avançado (mais de 2 anos)</option>
          </Select>
        </Field>
        <Field label="Frequência semanal">
          <Select value={v.days_per_week} onChange={set("days_per_week")}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} dias
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objetivo">
          <Input value={v.goal} onChange={set("goal")} placeholder="Hipertrofia, força, emagrecimento..." />
        </Field>
        <Field label="Grupos musculares prioritários">
          <Input value={v.focus} onChange={set("focus")} placeholder="Ex.: glúteos e posteriores" />
        </Field>
        <Field label="Recuperação, limitações ou dores" className="sm:col-span-2">
          <Textarea value={v.notes} onChange={set("notes")} placeholder="Ex.: dor no ombro direito, durmo pouco, só tenho 50 min por treino" />
        </Field>
      </div>
      <Button
        className="mt-4"
        loading={busy === "g"}
        onClick={() =>
          run("g", async () => {
            await backend.fn("ai-coach", { action: "strength", input: { ...v, days_per_week: Number(v.days_per_week) } });
            onCreated();
          }, "Sugestão pronta para revisão.")
        }
      >
        <Bot className="h-4 w-4" /> Gerar sugestão
      </Button>
    </Card>
  );
}

function RunningForm({ onCreated }: { onCreated: () => void }) {
  const [v, setV] = useState({ goal_km: "10", days_per_week: "3", weeks: "2", notes: "" });
  const { busy, run } = useAction();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Card>
      <CardTitle icon={<Footprints className="h-4 w-4 text-brand" />}>Sugestão de treinos de corrida</CardTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Objetivo de distância">
          <Select value={v.goal_km} onChange={set("goal_km")}>
            <option value="5">5 km</option>
            <option value="10">10 km</option>
            <option value="21">21 km</option>
            <option value="42">42 km</option>
            <option value="">Condicionamento geral</option>
          </Select>
        </Field>
        <Field label="Corridas por semana">
          <Select value={v.days_per_week} onChange={set("days_per_week")}>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Semanas a planejar">
          <Select value={v.weeks} onChange={set("weeks")}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Recuperação, dores ou observações" className="sm:col-span-3">
          <Textarea value={v.notes} onChange={set("notes")} placeholder="Ex.: canela dolorida após longões, só posso correr de manhã" />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">O volume semanal sugerido é limitado a +10% sobre sua média recente, calculado no servidor.</p>
      <Button
        className="mt-4"
        loading={busy === "g"}
        onClick={() =>
          run("g", async () => {
            await backend.fn("ai-coach", { action: "running", input: { goal_km: Number(v.goal_km) || null, days_per_week: Number(v.days_per_week), weeks: Number(v.weeks), notes: v.notes } });
            onCreated();
          }, "Sugestão pronta para revisão.")
        }
      >
        <Bot className="h-4 w-4" /> Gerar sugestão
      </Button>
    </Card>
  );
}

function SuggestionCard({ item, onDone }: { item: AIInteraction; onDone: () => void }) {
  const s = item.response;
  const nav = useNavigate();
  const { busy, run } = useAction();
  const { confirm } = useFeedback();

  const approve = async () => {
    if (!(await confirm({ title: "Aprovar sugestão?", text: s.type === "strength" ? "Uma nova divisão será criada e definida como ativa. Você pode editá-la depois em Treinos." : "Os treinos serão adicionados ao seu calendário de corrida como planejados." })))
      return;
    await run("ap", async () => {
      if (s.type === "strength") {
        const library = await backend.list<LibraryItem>("exercise_library", {});
        const actives = await backend.list<WorkoutPlan>("workout_plans", { eq: { active: true } });
        await Promise.all(actives.map((p) => backend.update("workout_plans", p.id, { active: false })));
        const plan = await backend.insert<WorkoutPlan>("workout_plans", { name: s.title, goal: item.request?.goal || null, notes: s.rationale || null, active: true, source: "ai" });
        for (const [i, d] of (s.days ?? []).entries()) {
          const day = await backend.insert<{ id: string }>("workout_days", { plan_id: plan.id, label: d.label, name: d.name, weekdays: d.weekdays ?? [], position: i });
          await backend.insertMany(
            "exercises",
            (d.exercises ?? []).map((e: any, j: number) => ({
              workout_day_id: day.id,
              library_id: library.find((l) => l.name.toLowerCase() === String(e.name).toLowerCase())?.id ?? null,
              name: e.name,
              muscle_group: e.muscle_group || null,
              sets: e.sets,
              reps: String(e.reps),
              load_kg: e.load_kg,
              rest_seconds: e.rest_seconds,
              notes: e.notes || null,
              position: j,
            })),
          );
        }
        logActivity("musculacao", `Plano de musculação aprovado: ${s.title}`);
      } else {
        const sessions = (s.weeks ?? []).flatMap((w: any) => w.sessions);
        await backend.insertMany(
          "running_sessions",
          sessions.map((x: any) => ({
            date: x.date,
            status: "planned",
            type: x.type,
            distance_km: x.distance_km,
            notes: [x.target_pace && `Pace alvo: ${x.target_pace}`, x.notes].filter(Boolean).join(" · ") || null,
            source: "ai",
          })),
        );
        logActivity("corrida", `Plano de corrida aprovado: ${s.title}`);
      }
      await backend.update("ai_interactions", item.id, { status: "approved" });
      onDone();
      nav(s.type === "strength" ? "/treinos" : "/corrida");
    }, "Sugestão aprovada e adicionada à agenda.");
  };

  return (
    <Card className="border-brand/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Badge tone="brand">{s.type === "strength" ? "Musculação" : "Corrida"}</Badge>
          <h3 className="mt-1 text-lg font-bold">{s.title}</h3>
          <p className="text-xs text-muted">Gerada em {fmtDate(item.created_at.slice(0, 10))}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={busy === "rj"}
            onClick={() =>
              run("rj", async () => {
                await backend.update("ai_interactions", item.id, { status: "rejected" });
                onDone();
              }, "Sugestão rejeitada.")
            }
          >
            <X className="h-4 w-4" /> Rejeitar
          </Button>
          <Button size="sm" onClick={approve} loading={busy === "ap"}>
            <Check className="h-4 w-4" /> Aprovar
          </Button>
        </div>
      </div>
      {s.rationale && <p className="mt-3 text-sm text-muted">{s.rationale}</p>}
      {s.cautions?.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {s.cautions.map((c: string, i: number) => (
            <li key={i} className="flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {c}
            </li>
          ))}
        </ul>
      )}
      {s.type === "strength" ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(s.days ?? []).map((d: any, i: number) => (
            <div key={i} className="rounded-xl bg-surface2 p-3">
              <p className="font-semibold">
                {d.label} {d.name && <span className="font-normal text-muted">— {d.name}</span>}
              </p>
              <p className="mb-2 text-[11px] text-brand">{(d.weekdays ?? []).map((w: number) => WEEKDAYS[w]).join(", ") || "Dias a definir"}</p>
              <ul className="space-y-1 text-sm">
                {(d.exercises ?? []).map((e: any, j: number) => (
                  <li key={j} className="flex justify-between gap-2">
                    <span>{e.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {e.sets}×{e.reps}
                      {e.load_kg != null ? ` · ${fmtNum(e.load_kg, 1)}kg` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(s.weeks ?? []).map((w: any) => (
            <div key={w.week} className="rounded-xl bg-surface2 p-3">
              <p className="mb-2 text-sm font-semibold">
                Semana {w.week} <span className="font-normal text-muted">· {fmtNum(w.sessions.reduce((a: number, x: any) => a + x.distance_km, 0), 1)} km (máx. {fmtNum(w.cap_km, 1)})</span>
              </p>
              <ul className="space-y-1 text-sm">
                {w.sessions.map((x: any, i: number) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {fmtDate(x.date, "EEE dd/MM")} · {RUN_TYPES[x.type]} · {fmtNum(x.distance_km, 1)} km
                    </span>
                    <span className="text-xs text-muted">{[x.target_pace, x.notes].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Chat({ items, loading, onAsked }: { items: AIInteraction[]; loading: boolean; onAsked: () => void }) {
  const [q, setQ] = useState("");
  const { busy, run } = useAction();
  const ask = () =>
    run("q", async () => {
      if (!q.trim()) throw new Error("Escreva sua pergunta.");
      await backend.fn("ai-coach", { action: "chat", input: { question: q.trim() } });
      setQ("");
      onAsked();
    });
  return (
    <Card>
      <CardTitle icon={<MessageSquare className="h-4 w-4 text-brand" />}>Pergunte ao assistente</CardTitle>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ex.: como organizar musculação e corrida na mesma semana?" />
        <Button onClick={ask} loading={busy === "q"} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <Empty title="Nenhuma conversa ainda" text="Faça perguntas sobre organização dos treinos, recuperação e progressão." />
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((i) => (
            <div key={i.id} className="space-y-2">
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-sm text-onbrand">{i.request?.question}</p>
              <p className={cn("max-w-[90%] whitespace-pre-line rounded-2xl rounded-bl-md bg-surface2 px-3 py-2 text-sm")}>{i.response?.answer}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

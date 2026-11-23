import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Flag, Info, Minus, Plus, SkipForward, Timer, X } from "lucide-react";
import { backend } from "@/lib/backend";
import { logActivity, useData } from "@/hooks/useData";
import type { Exercise, LibraryItem, WorkoutDay, WorkoutSession, WorkoutSet } from "@/lib/types";
import { cn, fmtDuration, fmtNum, toNum, today } from "@/lib/utils";
import { Button, Card, Empty, Modal, PageLoader, Progress, Textarea } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";

type Row = { reps: string; load: string };

export default function WorkoutRun() {
  const { dayId } = useParams();
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const { busy, run } = useAction();
  const { data, loading, error } = useData(async () => {
    const day = await backend.get<WorkoutDay>("workout_days", dayId!);
    if (!day) throw new Error("Treino não encontrado.");
    const exercises = await backend.list<Exercise>("exercises", { eq: { workout_day_id: day.id }, order: [["position", "asc"]] });
    const open = await backend.list<WorkoutSession>("workout_sessions", { eq: { workout_day_id: day.id, finished_at: null }, order: [["started_at", "desc"]], limit: 1 });
    const prev = await backend.list<WorkoutSession>("workout_sessions", { eq: { workout_day_id: day.id }, order: [["started_at", "desc"]], limit: 5 });
    const prevDone = prev.filter((s) => s.finished_at);
    const prevSets = prevDone.length ? await backend.list<WorkoutSet>("workout_sets", { eq: { session_id: prevDone[0].id } }) : [];
    const library = await backend.list<LibraryItem>("exercise_library", {});
    return { day, exercises, resume: open[0] ?? null, prevSets, library };
  }, [dayId]);

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [now, setNow] = useState(Date.now());
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [info, setInfo] = useState<LibraryItem | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const beeped = useRef(false);

  // Prepara linhas (reps/carga) com base no último treino ou nos valores da ficha
  useEffect(() => {
    if (!data) return;
    const init: Record<string, Row[]> = {};
    for (const e of data.exercises) {
      const prev = data.prevSets.filter((s) => s.exercise_id === e.id || s.exercise_name === e.name).sort((a, b) => a.set_number - b.set_number);
      const defReps = String(parseInt(e.reps) || "");
      init[e.id] = Array.from({ length: e.sets },(_, i) => ({
        reps: prev[i]?.reps != null ? String(prev[i].reps) : defReps,
        load: prev[i]?.load_kg != null ? String(prev[i].load_kg) : e.load_kg != null ? String(e.load_kg) : "",
      }));
    }
    setRows(init);
    if (data.resume) {
      setSession(data.resume);
      backend.list<WorkoutSet>("workout_sets", { eq: { session_id: data.resume.id } }).then((s) => {
        setSets(s);
        setRows((r) => {
          const copy = { ...r };
          for (const st of s) {
            const list = copy[st.exercise_id ?? ""];
            if (!list) continue;
            while (list.length < st.set_number) list.push({ reps: "", load: "" });
            list[st.set_number - 1] = { reps: st.reps?.toString() ?? "", load: st.load_kg?.toString() ?? "" };
          }
          return copy;
        });
      });
    }
  }, [data]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const remaining = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0;
  useEffect(() => {
    if (restEnd && remaining === 0 && !beeped.current) {
      beeped.current = true;
      try {
        navigator.vibrate?.([200, 100, 200]);
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, ctx.currentTime);
        o.start();
        o.stop(ctx.currentTime + 0.35);
      } catch {
        /* sem áudio */
      }
      toast("Descanso finalizado. Próxima série!", "info");
      setTimeout(() => setRestEnd(null), 1500);
    }
  }, [remaining, restEnd, toast]);

  const startRest = (s: number) => {
    if (!s) return;
    beeped.current = false;
    setRestTotal(s);
    setRestEnd(Date.now() + s * 1000);
  };

  const ensureSession = useCallback(async () => {
    if (session) return session;
    const s = await backend.insert<WorkoutSession>("workout_sessions", {
      workout_day_id: data!.day.id,
      title: `${data!.day.label}${data!.day.name ? ` — ${data!.day.name}` : ""}`,
      started_at: new Date().toISOString(),
    });
    setSession(s);
    return s;
  }, [session, data]);

  if (loading) return <PageLoader />;
  if (error || !data) return <Empty title="Treino não encontrado" text={error ?? undefined} action={<Button onClick={() => nav("/treinos")}>Voltar</Button>} />;
  if (!data.exercises.length) return <Empty title="Este treino não tem exercícios" action={<Button onClick={() => nav("/treinos")}>Adicionar exercícios</Button>} />;

  const totalSets = Object.values(rows).reduce((a, r) => a + r.length, 0);
  const doneSets = sets.filter((s) => s.completed).length;
  const elapsed = session ? Math.max(0, Math.floor((now - new Date(session.started_at).getTime()) / 1000)) : 0;

  const toggleSet = (e: Exercise, i: number) =>
    run(`set-${e.id}-${i}`, async () => {
      const s = await ensureSession();
      const row = rows[e.id][i];
      const existing = sets.find((x) => x.session_id === s.id && x.exercise_id === e.id && x.set_number === i + 1);
      const payload = { reps: toNum(row.reps) != null ? Math.round(toNum(row.reps)!) : null, load_kg: toNum(row.load) };
      if (existing) {
        const updated = await backend.update<WorkoutSet>("workout_sets", existing.id, { ...payload, completed: !existing.completed });
        setSets((xs) => xs.map((x) => (x.id === existing.id ? updated : x)));
        if (updated.completed) startRest(e.rest_seconds);
      } else {
        const created = await backend.insert<WorkoutSet>("workout_sets", { session_id: s.id, exercise_id: e.id, exercise_name: e.name, set_number: i + 1, ...payload, completed: true });
        setSets((xs) => [...xs, created]);
        startRest(e.rest_seconds);
      }
    });

  const setRow = (exId: string, i: number, k: keyof Row, val: string) => setRows((r) => ({ ...r, [exId]: r[exId].map((row, j) => (j === i ? { ...row, [k]: val } : row)) }));

  const finish = () =>
    run("finish", async () => {
      const s = await ensureSession();
      const duration = Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000);
      await backend.update("workout_sessions", s.id, { finished_at: new Date().toISOString(), duration_seconds: duration, notes: notes.trim() || null });
      // Atualiza a carga de referência da ficha com a maior carga concluída
      for (const e of data.exercises) {
        const loads = sets.filter((x) => x.exercise_id === e.id && x.completed && x.load_kg != null).map((x) => Number(x.load_kg));
        if (loads.length) {
          const max = Math.max(...loads);
          if (max !== Number(e.load_kg)) await backend.update("exercises", e.id, { load_kg: max });
        }
      }
      await logActivity("musculacao", `${data.day.label} concluído (${fmtDuration(duration)})`, { ref_id: s.id, date: today(), details: { sets: doneSets } });
      toast("Treino finalizado! 💪");
      nav("/treinos");
    });

  const cancel = async () => {
    if (!session) return nav("/treinos");
    if (!(await confirm({ title: "Descartar treino?", text: "As séries registradas nesta sessão serão apagadas.", danger: true, confirmLabel: "Descartar" }))) return;
    await run("cancel", async () => {
      await backend.remove("workout_sessions", session.id);
      nav("/treinos");
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav("/treinos")}>
          <ChevronLeft className="h-4 w-4" /> Treinos
        </Button>
        <Button variant="ghost" size="sm" onClick={cancel} loading={busy === "cancel"}>
          <X className="h-4 w-4" /> Descartar
        </Button>
      </div>

      <Card className="sticky top-2 z-20 border-brand/20 bg-surface/95 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{data.day.label}</p>
            <h1 className="text-xl font-bold">{data.day.name || "Treino"}</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold">{fmtDuration(elapsed)}</p>
            <p className="text-xs text-muted">
              {doneSets}/{totalSets} séries
            </p>
          </div>
        </div>
        <Progress value={doneSets} max={totalSets} className="mt-3" />
        {!session && <p className="mt-2 text-xs text-muted">O cronômetro começa ao concluir a primeira série.</p>}
      </Card>

      {data.exercises.map((e) => {
        const lib = data.library.find((l) => l.id === e.library_id || l.name === e.name);
        const exRows = rows[e.id] ?? [];
        return (
          <Card key={e.id}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{e.name}</h3>
                <p className="text-xs text-muted">
                  {e.sets}×{e.reps} · descanso {e.rest_seconds}s{e.muscle_group && ` · ${e.muscle_group}`}
                </p>
                {e.notes && <p className="mt-1 text-xs text-amber-700">{e.notes}</p>}
              </div>
              {lib && (
                <Button size="icon" variant="ghost" onClick={() => setInfo(lib)} aria-label="Instruções">
                  <Info className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-[32px_1fr_1fr_44px] items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
              <span>Série</span>
              <span>Reps</span>
              <span>Carga (kg)</span>
              <span />
            </div>
            {exRows.map((row, i) => {
              const st = sets.find((x) => x.exercise_id === e.id && x.set_number === i + 1);
              const done = !!st?.completed;
              return (
                <div key={i} className={cn("mt-1.5 grid grid-cols-[32px_1fr_1fr_44px] items-center gap-2 rounded-xl p-1", done && "bg-brand-soft")}>
                  <span className="text-center text-sm font-semibold text-muted">{i + 1}</span>
                  <input
                    inputMode="numeric"
                    value={row.reps}
                    onChange={(ev) => setRow(e.id, i, "reps", ev.target.value)}
                    className="h-10 w-full rounded-lg border border-line bg-surface2 text-center text-sm outline-none focus:border-brand/60"
                    aria-label={`Repetições série ${i + 1}`}
                  />
                  <input
                    inputMode="decimal"
                    value={row.load}
                    onChange={(ev) => setRow(e.id, i, "load", ev.target.value)}
                    className="h-10 w-full rounded-lg border border-line bg-surface2 text-center text-sm outline-none focus:border-brand/60"
                    aria-label={`Carga série ${i + 1}`}
                  />
                  <button
                    onClick={() => toggleSet(e, i)}
                    disabled={busy === `set-${e.id}-${i}`}
                    className={cn("flex h-10 w-11 items-center justify-center rounded-lg border transition", done ? "border-brand bg-brand text-onbrand" : "border-line text-muted hover:border-brand/60")}
                    aria-label={done ? "Desmarcar série" : "Concluir série"}
                  >
                    <Check className="h-5 w-5" />
                  </button>
                </div>
              );
            })}
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRows((r) => ({ ...r, [e.id]: [...r[e.id], { ...(r[e.id][r[e.id].length - 1] ?? { reps: "", load: "" }) }] }))}>
                <Plus className="h-4 w-4" /> Série
              </Button>
              {exRows.length > 1 && !sets.some((x) => x.exercise_id === e.id && x.set_number === exRows.length) && (
                <Button size="sm" variant="ghost" onClick={() => setRows((r) => ({ ...r, [e.id]: r[e.id].slice(0, -1) }))}>
                  <Minus className="h-4 w-4" /> Série
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => startRest(e.rest_seconds)}>
                <Timer className="h-4 w-4" /> Descanso
              </Button>
            </div>
          </Card>
        );
      })}

      <Button size="lg" className="w-full" onClick={() => setFinishOpen(true)} disabled={!doneSets}>
        <Flag className="h-5 w-5" /> Finalizar treino
      </Button>

      {/* Cronômetro de descanso */}
      {restEnd && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto w-[calc(100%-2rem)] max-w-md animate-in rounded-2xl border border-brand/30 bg-surface/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted">Descanso</p>
              <p className={cn("font-mono text-3xl font-bold", remaining === 0 && "text-brand")}>{fmtDuration(remaining)}</p>
              <Progress value={restTotal - remaining} max={restTotal} className="mt-2" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setRestEnd((r) => (r ?? Date.now()) + 15000)}>
                +15s
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRestEnd(null)}>
                <SkipForward className="h-4 w-4" /> Pular
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={finishOpen} onClose={() => setFinishOpen(false)} title="Finalizar treino">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-surface2 p-3">
              <p className="text-xs text-muted">Séries concluídas</p>
              <p className="text-2xl font-bold">
                {doneSets}/{totalSets}
              </p>
            </div>
            <div className="rounded-xl bg-surface2 p-3">
              <p className="text-xs text-muted">Volume</p>
              <p className="text-2xl font-bold">{fmtNum(sets.filter((s) => s.completed).reduce((a, s) => a + (Number(s.load_kg) || 0) * (s.reps || 0), 0))} kg</p>
            </div>
          </div>
          {doneSets < totalSets && <p className="text-sm text-amber-800">Ainda há séries não concluídas. Você pode finalizar mesmo assim.</p>}
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como foi o treino? (opcional)" />
          <Button className="w-full" onClick={finish} loading={busy === "finish"}>
            Salvar e finalizar
          </Button>
        </div>
      </Modal>

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ""}>
        <p className="mb-2 text-sm text-muted">{info?.description}</p>
        <p className="text-sm leading-relaxed">{info?.instructions}</p>
      </Modal>
    </div>
  );
}

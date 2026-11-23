// Edge Function: assistente de treinamento (musculação, corrida e perguntas livres).
// As sugestões ficam com status "pending" e só entram na agenda após aprovação do usuário no app.
import { callAI, getUserClient, handle, HttpError, json, num } from "../_shared/common.ts";
import { ageFromBirth } from "../_shared/calc.ts";

const SYSTEM = `Você é o assistente de treinamento do app Bucurinho's Fit (Brasil).
Regras obrigatórias:
- Suas sugestões são educativas, não são prescrição médica nem garantia de resultados.
- Respeite o nível de experiência, a recuperação e o histórico do usuário. Progrida de forma gradual: nunca aumente o volume semanal de corrida mais de 10% em relação à média recente, e inclua dias de descanso.
- Para iniciantes, priorize técnica, cargas leves e exercícios básicos.
- Quando o usuário combina musculação e corrida, evite treino pesado de pernas no dia anterior a corridas intensas ou longas, e prefira separar os dois em turnos ou dias diferentes.
- Se o usuário relatar dor, lesão ou condição de saúde, recomende avaliação de um profissional (médico, fisioterapeuta ou educador físico) antes de seguir.
- Responda SOMENTE com JSON válido, no formato pedido, em português do Brasil.`;

const RUN_TYPES = ["leve", "rodagem", "intervalado", "tiros", "longao", "ritmo", "recuperacao"];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nextMonday() {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

Deno.serve(handle(async (req) => {
  const { supabase, userId } = await getUserClient(req);
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const input = body.input ?? {};

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (!profile) throw new HttpError(400, "Perfil não encontrado.");
  const age = ageFromBirth(profile.birth_date);
  const userLine = `Sexo: ${profile.sex ?? "não informado"}; Idade: ${age ?? "não informada"}; Altura: ${profile.height_cm ?? "?"} cm; Peso: ${profile.weight_kg ?? "?"} kg; Objetivos: ${profile.fitness_goals || "não informados"}`;

  // ------------------------------------------------------------------ MUSCULAÇÃO
  if (action === "strength") {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const [{ data: sets }, { data: sessions }] = await Promise.all([
      supabase.from("workout_sets").select("exercise_name, reps, load_kg, completed, created_at").eq("user_id", userId).eq("completed", true).gte("created_at", since),
      supabase.from("workout_sessions").select("started_at").eq("user_id", userId).gte("started_at", since),
    ]);
    const best: Record<string, { load: number; reps: number }> = {};
    for (const s of sets ?? []) {
      const l = Number(s.load_kg) || 0;
      if (!best[s.exercise_name] || l > best[s.exercise_name].load) best[s.exercise_name] = { load: l, reps: s.reps ?? 0 };
    }
    const history = Object.entries(best).slice(0, 40).map(([n, b]) => `${n}: ${b.load} kg x ${b.reps}`).join("; ") || "sem histórico registrado";
    const days = Math.min(6, Math.max(2, Number(input.days_per_week) || 3));

    const prompt = `Usuário: ${userLine}
Objetivo do treino: ${input.goal || profile.fitness_goals || "hipertrofia e saúde"}
Experiência: ${input.experience || "iniciante"}
Frequência semanal desejada: ${days} dias
Grupos musculares prioritários: ${input.focus || "equilibrado"}
Observações/recuperação/limitações: ${input.notes || "nenhuma"}
Sessões de musculação nos últimos 60 dias: ${(sessions ?? []).length}
Melhores cargas recentes: ${history}

Monte uma divisão de treino semanal com ${days} treinos (labels "Treino A", "Treino B", ...). Para exercícios com histórico, sugira cargas com progressão de no máximo 5–10%. Sem histórico, use load_kg null.
Distribua em dias da semana (0=domingo ... 6=sábado) evitando o mesmo grupo muscular em dias consecutivos.
Formato JSON:
{"title": string, "rationale": string, "cautions": [string], "days": [{"label": string, "name": string, "weekdays": [number], "exercises": [{"name": string, "muscle_group": string, "sets": number, "reps": string, "load_kg": number|null, "rest_seconds": number, "notes": string}]}]}`;

    const ai = await callAI(SYSTEM, prompt);
    if (!Array.isArray(ai?.days) || !ai.days.length) throw new HttpError(502, "A IA não retornou uma divisão de treino. Tente novamente.");
    const suggestion = {
      type: "strength",
      title: String(ai.title || "Plano de musculação sugerido").slice(0, 120),
      rationale: String(ai.rationale || ""),
      cautions: Array.isArray(ai.cautions) ? ai.cautions.map(String).slice(0, 6) : [],
      days: ai.days.slice(0, 7).map((d: any, i: number) => ({
        label: String(d.label || `Treino ${String.fromCharCode(65 + i)}`).slice(0, 40),
        name: String(d.name || "").slice(0, 80),
        weekdays: (Array.isArray(d.weekdays) ? d.weekdays : []).map(Number).filter((n: number) => n >= 0 && n <= 6),
        exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 12).map((e: any) => ({
          name: String(e.name || "Exercício").slice(0, 100),
          muscle_group: String(e.muscle_group || "").slice(0, 40),
          sets: Math.min(10, Math.max(1, Math.round(num(e.sets, 3)))),
          reps: String(e.reps ?? "10").slice(0, 20),
          load_kg: e.load_kg == null ? null : Math.max(0, num(e.load_kg)),
          rest_seconds: Math.min(300, Math.max(30, Math.round(num(e.rest_seconds, 60)))),
          notes: String(e.notes || "").slice(0, 200),
        })),
      })),
    };
    const { data: row, error } = await supabase.from("ai_interactions").insert({ user_id: userId, kind: "musculacao", request: input, response: suggestion, status: "pending" }).select().single();
    if (error) throw new HttpError(500, error.message);
    return json({ interaction: row });
  }

  // ------------------------------------------------------------------ CORRIDA
  if (action === "running") {
    if (!profile.running_enabled) throw new HttpError(403, "O módulo de corrida não está habilitado para esta conta.");
    const since = new Date(Date.now() - 56 * 864e5).toISOString().slice(0, 10);
    const { data: runs } = await supabase.from("running_sessions").select("date, distance_km, duration_seconds, type").eq("user_id", userId).eq("status", "done").gte("date", since).order("date");
    const weekly: Record<string, number> = {};
    let paceSum = 0, paceN = 0;
    for (const r of runs ?? []) {
      const d = new Date(r.date + "T12:00:00Z");
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const k = isoDate(monday);
      weekly[k] = (weekly[k] ?? 0) + Number(r.distance_km);
      if (r.duration_seconds && Number(r.distance_km) > 0) { paceSum += r.duration_seconds / Number(r.distance_km); paceN++; }
    }
    const weeks = Object.values(weekly);
    const last4 = weeks.slice(-4);
    const avg = last4.length ? last4.reduce((a, b) => a + b, 0) / last4.length : 0;
    const avgPace = paceN ? Math.round(paceSum / paceN) : null;
    const nWeeks = Math.min(4, Math.max(1, Number(input.weeks) || 2));
    const runDays = Math.min(6, Math.max(2, Number(input.days_per_week) || 3));
    // Teto de volume: +10% por semana sobre a média recente (mínimo 8 km/sem para quem está começando)
    const caps = Array.from({ length: nWeeks }, (_, i) => Math.round(Math.max(avg, 8) * Math.pow(1.1, i + (avg ? 1 : 0)) * 10) / 10);

    const prompt = `Usuário: ${userLine}
Objetivo de distância: ${input.goal_km ? input.goal_km + " km" : "melhorar condicionamento"}
Frequência semanal desejada: ${runDays} corridas
Média semanal recente (últimas 4 semanas): ${avg.toFixed(1)} km
Semanas registradas nas últimas 8: ${weeks.length}
Pace médio recente: ${avgPace ? `${Math.floor(avgPace / 60)}:${String(avgPace % 60).padStart(2, "0")} min/km` : "sem dados"}
Observações/recuperação: ${input.notes || "nenhuma"}

Monte ${nWeeks} semana(s) de treino. Volume MÁXIMO por semana: ${caps.map((c, i) => `semana ${i + 1}: ${c} km`).join("; ")}.
Tipos permitidos: ${RUN_TYPES.join(", ")}. Inclua no máximo 1 treino intenso (intervalado/tiros/ritmo) por semana para iniciantes e 2 para experientes.
weekday: 0=domingo ... 6=sábado.
Formato JSON:
{"title": string, "rationale": string, "cautions": [string], "weeks": [{"week": number, "sessions": [{"weekday": number, "type": string, "distance_km": number, "target_pace": string, "notes": string}]}]}`;

    const ai = await callAI(SYSTEM, prompt);
    if (!Array.isArray(ai?.weeks) || !ai.weeks.length) throw new HttpError(502, "A IA não retornou um plano de corrida. Tente novamente.");
    const start = nextMonday();
    const outWeeks = ai.weeks.slice(0, nWeeks).map((w: any, wi: number) => {
      let sessions = (Array.isArray(w.sessions) ? w.sessions : []).slice(0, 7).map((s: any) => ({
        weekday: Math.min(6, Math.max(0, Math.round(num(s.weekday, 1)))),
        type: RUN_TYPES.includes(s.type) ? s.type : "leve",
        distance_km: Math.max(0.5, num(s.distance_km, 3)),
        target_pace: String(s.target_pace || "").slice(0, 20),
        notes: String(s.notes || "").slice(0, 200),
      }));
      // Aplica o teto de volume no servidor, independentemente do que a IA retornou
      const total = sessions.reduce((a: number, s: any) => a + s.distance_km, 0);
      if (total > caps[wi]) {
        const f = caps[wi] / total;
        sessions = sessions.map((s: any) => ({ ...s, distance_km: Math.round(s.distance_km * f * 10) / 10 }));
      }
      sessions = sessions.map((s: any) => {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + wi * 7 + ((s.weekday + 6) % 7));
        return { ...s, date: isoDate(d) };
      });
      return { week: wi + 1, cap_km: caps[wi], sessions };
    });
    const suggestion = {
      type: "running",
      title: String(ai.title || "Plano de corrida sugerido").slice(0, 120),
      rationale: String(ai.rationale || ""),
      cautions: Array.isArray(ai.cautions) ? ai.cautions.map(String).slice(0, 6) : [],
      weeks: outWeeks,
    };
    const { data: row, error } = await supabase.from("ai_interactions").insert({ user_id: userId, kind: "corrida", request: input, response: suggestion, status: "pending" }).select().single();
    if (error) throw new HttpError(500, error.message);
    return json({ interaction: row });
  }

  // ------------------------------------------------------------------ CHAT
  if (action === "chat") {
    const question = String(input.question || "").trim().slice(0, 1500);
    if (!question) throw new HttpError(400, "Escreva sua pergunta.");
    const since = new Date(Date.now() - 28 * 864e5).toISOString();
    const [{ data: sessions }, { data: runs }] = await Promise.all([
      supabase.from("workout_sessions").select("title, started_at").eq("user_id", userId).gte("started_at", since),
      profile.running_enabled
        ? supabase.from("running_sessions").select("date, distance_km, type").eq("user_id", userId).eq("status", "done").gte("date", since.slice(0, 10))
        : Promise.resolve({ data: [] }),
    ]);
    const ctx = `Usuário: ${userLine}
Treinos de musculação nas últimas 4 semanas: ${(sessions ?? []).length}
Corridas nas últimas 4 semanas: ${(runs ?? []).length} (${(runs ?? []).reduce((a: number, r: any) => a + Number(r.distance_km), 0).toFixed(1)} km)`;
    const ai = await callAI(SYSTEM, `${ctx}\n\nPergunta: ${question}\n\nFormato JSON: {"answer": string}`);
    const answer = String(ai?.answer || "").slice(0, 6000);
    const { data: row } = await supabase.from("ai_interactions").insert({ user_id: userId, kind: "chat", request: { question }, response: { answer }, status: "done" }).select().single();
    return json({ interaction: row });
  }

  throw new HttpError(400, "Ação inválida");
}));

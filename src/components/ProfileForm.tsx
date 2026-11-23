import { FormEvent, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "./ui";
import type { Profile } from "@/lib/types";
import { ACTIVITY_LABEL, toNum, today } from "@/lib/utils";

export type ProfileFormValues = Pick<
  Profile,
  "full_name" | "birth_date" | "sex" | "height_cm" | "weight_kg" | "goal_weight_kg" | "activity_level" | "fitness_goals" | "water_goal_ml"
>;

export function ProfileForm({ initial, onSubmit, submitLabel = "Salvar" }: { initial: Profile; onSubmit: (v: ProfileFormValues) => Promise<void>; submitLabel?: string }) {
  const [v, setV] = useState({
    full_name: initial.full_name ?? "",
    birth_date: initial.birth_date ?? "",
    sex: initial.sex ?? "",
    height_cm: initial.height_cm?.toString() ?? "",
    weight_kg: initial.weight_kg?.toString() ?? "",
    goal_weight_kg: initial.goal_weight_kg?.toString() ?? "",
    activity_level: initial.activity_level ?? "",
    fitness_goals: initial.fitness_goals ?? "",
    water_goal_ml: String(initial.water_goal_ml ?? 2500),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const height = toNum(v.height_cm);
    const weight = toNum(v.weight_kg);
    const goal = toNum(v.goal_weight_kg);
    const water = toNum(v.water_goal_ml);
    if (height != null && (height < 100 || height > 250)) return setError("Altura deve estar entre 100 e 250 cm.");
    if (weight != null && (weight < 30 || weight > 350)) return setError("Peso deve estar entre 30 e 350 kg.");
    if (goal != null && (goal < 30 || goal > 350)) return setError("Meta de peso deve estar entre 30 e 350 kg.");
    if (v.birth_date && v.birth_date > today()) return setError("Data de nascimento inválida.");
    setBusy(true);
    try {
      await onSubmit({
        full_name: v.full_name.trim(),
        birth_date: v.birth_date || null,
        sex: (v.sex || null) as Profile["sex"],
        height_cm: height,
        weight_kg: weight,
        goal_weight_kg: goal,
        activity_level: v.activity_level || null,
        fitness_goals: v.fitness_goals.trim() || null,
        water_goal_ml: water && water >= 500 && water <= 8000 ? Math.round(water) : 2500,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome" className="sm:col-span-2">
        <Input required value={v.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="Data de nascimento">
        <Input type="date" required value={v.birth_date} onChange={set("birth_date")} max={today()} />
      </Field>
      <Field label="Sexo">
        <Select required value={v.sex} onChange={set("sex")}>
          <option value="">Selecione</option>
          <option value="feminino">Feminino</option>
          <option value="masculino">Masculino</option>
          <option value="outro">Outro</option>
        </Select>
      </Field>
      <Field label="Altura (cm)">
        <Input inputMode="decimal" required value={v.height_cm} onChange={set("height_cm")} placeholder="170" />
      </Field>
      <Field label="Peso atual (kg)">
        <Input inputMode="decimal" required value={v.weight_kg} onChange={set("weight_kg")} placeholder="70" />
      </Field>
      <Field label="Meta de peso (kg)">
        <Input inputMode="decimal" value={v.goal_weight_kg} onChange={set("goal_weight_kg")} placeholder="65" />
      </Field>
      <Field label="Meta de água por dia (ml)">
        <Input inputMode="numeric" value={v.water_goal_ml} onChange={set("water_goal_ml")} />
      </Field>
      <Field label="Nível de atividade física" className="sm:col-span-2">
        <Select required value={v.activity_level} onChange={set("activity_level")}>
          <option value="">Selecione</option>
          {Object.entries(ACTIVITY_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Objetivos físicos" className="sm:col-span-2">
        <Textarea value={v.fitness_goals} onChange={set("fitness_goals")} placeholder="Ex.: perder 5 kg, ganhar força, correr 10 km" />
      </Field>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

import { EXERCISE_LIBRARY } from "../src/lib/exerciseLibrary.ts";
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const rows = EXERCISE_LIBRARY.map(e => `  (${q(e.name)}, ${q(e.muscle_group)}, ${q(e.description)}, ${q(e.instructions)})`).join(",\n");
console.log(`-- Biblioteca de exercícios do sistema (gerado por scripts/gen-seed.ts)\ninsert into public.exercise_library (name, muscle_group, description, instructions) values\n${rows};`);

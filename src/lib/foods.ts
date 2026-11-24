// Tabela de substituição de alimentos (valores aproximados por 100 g, baseados na TACO/USDA).
// Usada para trocar um alimento por outro em quantidade equivalente, sem depender da IA.

export type FoodGroup = "proteina" | "carboidrato" | "leguminosa" | "fruta" | "laticinio" | "gordura" | "vegetal";

export type FoodRef = {
  name: string;
  group: FoodGroup;
  /** kcal, proteína, carboidrato, gordura, fibra por 100 g */
  kcal: number; p: number; c: number; g: number; f: number;
  /** medida caseira: nome e gramas de 1 unidade */
  unit?: [string, string, number];
  /** palavras extras para reconhecer o alimento pelo nome */
  alias?: string;
};

/** Como comprar: nome do item cru e fator (peso cru = peso preparado × fator). */
export const RAW: Record<string, [string, number]> = {
  "Arroz branco cozido": ["Arroz branco (cru)", 0.4],
  "Arroz integral cozido": ["Arroz integral (cru)", 0.4],
  "Macarrão cozido": ["Macarrão (cru)", 0.43],
  "Macarrão integral cozido": ["Macarrão integral (cru)", 0.43],
  "Feijão carioca cozido": ["Feijão carioca (cru)", 0.45],
  "Feijão preto cozido": ["Feijão preto (cru)", 0.45],
  "Lentilha cozida": ["Lentilha (crua)", 0.45],
  "Grão-de-bico cozido": ["Grão-de-bico (cru)", 0.45],
  "Quinoa cozida": ["Quinoa (crua)", 0.38],
  "Cuscuz de milho": ["Flocão de milho", 0.45],
  "Peito de frango grelhado": ["Peito de frango (cru)", 1.35],
  "Coxa de frango assada sem pele": ["Coxa/sobrecoxa de frango (crua)", 1.35],
  "Patinho bovino grelhado": ["Patinho bovino (cru)", 1.4],
  "Carne moída refogada": ["Carne moída (crua)", 1.35],
  "Alcatra grelhada": ["Alcatra (crua)", 1.4],
  "Lombo suíno assado": ["Lombo suíno (cru)", 1.4],
  "Filé de tilápia grelhado": ["Filé de tilápia (cru)", 1.3],
  "Salmão grelhado": ["Salmão (cru)", 1.25],
  "Camarão cozido": ["Camarão (cru, limpo)", 1.3],
  "Clara de ovo cozida": ["Ovos (para as claras)", 1],
  "Ovo cozido": ["Ovos", 1],
};

/** Em que tipo de refeição o alimento costuma aparecer (para variações que façam sentido). */
const CAFE = /^(P[aã]o|Tapioca|Aveia|Granola|Cuscuz|Ovo|Clara|Peito de peru|Whey|Mel|Queijo|Ricota|Iogurte|Leite)/;
const PRATO = /^(Arroz|Macarr|Batata|Mandioca|Cuscuz|Milho|Quinoa|Feij|Lentilha|Gr[aã]o|Peito de frango|Coxa|Patinho|Carne|Alcatra|Lombo|Fil[eé]|Salm|Atum|Sardinha|Camar|Ovo|Tofu)/;
export function contextOf(name: string, mealType?: string): ("cafe" | "prato")[] {
  const ref = matchFood(name);
  const n = ref?.name ?? name;
  const out: ("cafe" | "prato")[] = [];
  if (CAFE.test(n) || ref?.group === "fruta") out.push("cafe");
  if (PRATO.test(n) || ref?.group === "vegetal" || ref?.group === "leguminosa") out.push("prato");
  if (out.length) return out;
  return mealType === "almoco" || mealType === "jantar" ? ["prato"] : ["cafe"];
}

export type Section = "Hortifrúti" | "Carnes, peixes e ovos" | "Laticínios" | "Padaria" | "Mercearia";
export const SECTION_ORDER: Section[] = ["Hortifrúti", "Carnes, peixes e ovos", "Laticínios", "Padaria", "Mercearia"];
export function sectionOf(f: FoodRef | null, group: FoodGroup): Section {
  if (f && /^P[aã]o/.test(f.name)) return "Padaria";
  if (f && /^(Batata|Mandioca|Milho verde)/.test(f.name)) return "Hortifrúti";
  if (f?.name === "Whey protein") return "Mercearia";
  return group === "fruta" || group === "vegetal" ? "Hortifrúti" : group === "proteina" ? "Carnes, peixes e ovos" : group === "laticinio" ? "Laticínios" : "Mercearia";
}

export const GROUP_LABEL: Record<FoodGroup, string> = {
  proteina: "Proteínas",
  carboidrato: "Carboidratos",
  leguminosa: "Leguminosas",
  fruta: "Frutas",
  laticinio: "Laticínios",
  gordura: "Gorduras boas",
  vegetal: "Vegetais",
};

/** Nutriente usado para igualar a porção dentro de cada grupo (como nas listas de substituição). */
export const GROUP_KEY: Record<FoodGroup, "p" | "c" | "g" | "kcal"> = {
  proteina: "p",
  carboidrato: "c",
  leguminosa: "kcal",
  fruta: "c",
  laticinio: "p",
  gordura: "g",
  vegetal: "kcal",
};

const F = (name: string, group: FoodGroup, kcal: number, p: number, c: number, g: number, f: number, unit?: [string, string, number], alias?: string): FoodRef => ({ name, group, kcal, p, c, g, f, unit, alias });

export const FOODS: FoodRef[] = [
  // Proteínas (preparadas)
  F("Peito de frango grelhado", "proteina", 159, 32, 0, 2.5, 0, ["filé", "filés", 100], "frango peito file"),
  F("Coxa de frango assada sem pele", "proteina", 215, 28.5, 0, 10.4, 0, ["coxa", "coxas", 70], "sobrecoxa"),
  F("Patinho bovino grelhado", "proteina", 219, 35.9, 0, 7.3, 0, ["bife", "bifes", 100], "carne bife"),
  F("Carne moída refogada", "proteina", 212, 26.7, 0, 10.9, 0, ["col. sopa", "col. sopa", 25], "acem patinho moido"),
  F("Alcatra grelhada", "proteina", 241, 31.9, 0, 11.6, 0, ["bife", "bifes", 100], "picanha maminha contra file"),
  F("Lombo suíno assado", "proteina", 210, 35.7, 0, 6.4, 0, ["fatia", "fatias", 60], "porco"),
  F("Filé de tilápia grelhado", "proteina", 128, 26.2, 0, 2.7, 0, ["filé", "filés", 120], "peixe tilapia"),
  F("Salmão grelhado", "proteina", 229, 23.9, 0, 14, 0, ["posta", "postas", 120], "peixe salmao"),
  F("Atum em lata (em água)", "proteina", 116, 25.5, 0, 0.8, 0, ["lata", "latas", 120], "atum"),
  F("Sardinha em lata (escorrida)", "proteina", 208, 24.6, 0, 11.5, 0, ["lata", "latas", 84], "sardinha"),
  F("Camarão cozido", "proteina", 90, 19, 0, 1, 0, undefined, "camarao"),
  F("Ovo cozido", "proteina", 146, 13.3, 0.6, 9.5, 0, ["ovo", "ovos", 50], "ovo mexido omelete"),
  F("Clara de ovo cozida", "proteina", 59, 13.4, 0, 0.1, 0, ["clara", "claras", 33], "claras"),
  F("Peito de peru", "proteina", 110, 20, 2, 2, 0, ["fatia", "fatias", 15], "peru blanquet"),
  F("Tofu firme", "proteina", 144, 17.3, 2.8, 8.7, 2.3, undefined, "tofu"),
  F("Whey protein", "proteina", 400, 80, 8, 6, 0, ["scoop", "scoops", 30], "whey proteina po"),
  // Carboidratos
  F("Arroz branco cozido", "carboidrato", 128, 2.5, 28.1, 0.2, 1.6, ["col. sopa", "col. sopa", 25], "arroz"),
  F("Arroz integral cozido", "carboidrato", 124, 2.6, 25.8, 1, 2.7, ["col. sopa", "col. sopa", 25], "arroz integral"),
  F("Macarrão cozido", "carboidrato", 158, 5.8, 30.9, 0.9, 1.8, ["pegador", "pegadores", 50], "massa espaguete"),
  F("Macarrão integral cozido", "carboidrato", 149, 6, 30, 1.7, 3.9, ["pegador", "pegadores", 50], "massa integral"),
  F("Batata inglesa cozida", "carboidrato", 52, 1.2, 11.9, 0, 1.3, ["unidade média", "unidades médias", 140], "batata"),
  F("Batata-doce cozida", "carboidrato", 77, 0.6, 18.4, 0.1, 2.2, ["unidade média", "unidades médias", 150], "batata doce"),
  F("Mandioca cozida", "carboidrato", 125, 0.6, 30.1, 0.3, 1.6, ["pedaço", "pedaços", 50], "aipim macaxeira"),
  F("Cuscuz de milho", "carboidrato", 113, 2.2, 25.3, 0.7, 2.1, ["fatia", "fatias", 100], "cuscuz flocao"),
  F("Tapioca (goma)", "carboidrato", 240, 0.1, 59, 0.1, 0.5, ["tapioca média", "tapiocas médias", 50], "tapioca goma beiju"),
  F("Aveia em flocos", "carboidrato", 394, 13.9, 66.6, 8.5, 9.1, ["col. sopa", "col. sopa", 15], "aveia farelo"),
  F("Pão francês", "carboidrato", 300, 8, 58.6, 3.1, 2.3, ["unidade", "unidades", 50], "pao frances carioquinha"),
  F("Pão de forma integral", "carboidrato", 253, 9.4, 49.9, 3.7, 6.9, ["fatia", "fatias", 25], "pao integral forma"),
  F("Granola", "carboidrato", 421, 10, 66, 13, 7, ["col. sopa", "col. sopa", 12], "granola"),
  F("Milho verde cozido", "carboidrato", 96, 3.4, 21, 1.5, 2.4, ["col. sopa", "col. sopa", 20], "milho"),
  F("Quinoa cozida", "carboidrato", 120, 4.4, 21.3, 1.9, 2.8, ["col. sopa", "col. sopa", 20], "quinoa"),
  F("Mel", "carboidrato", 309, 0, 84, 0, 0, ["col. chá", "col. chá", 7], "mel"),
  // Leguminosas
  F("Feijão carioca cozido", "leguminosa", 76, 4.8, 13.6, 0.5, 8.5, ["concha", "conchas", 90], "feijao carioca"),
  F("Feijão preto cozido", "leguminosa", 77, 4.5, 14, 0.5, 8.4, ["concha", "conchas", 90], "feijao preto"),
  F("Lentilha cozida", "leguminosa", 93, 6.3, 16.3, 0.5, 7.9, ["concha", "conchas", 90], "lentilha"),
  F("Grão-de-bico cozido", "leguminosa", 164, 8.9, 27.4, 2.6, 7.6, ["col. sopa", "col. sopa", 25], "grao de bico homus"),
  // Frutas
  F("Banana prata", "fruta", 98, 1.3, 26, 0.1, 2, ["unidade", "unidades", 65], "banana"),
  F("Banana nanica", "fruta", 92, 1.4, 23.8, 0.1, 1.9, ["unidade", "unidades", 90], "banana d'agua"),
  F("Maçã", "fruta", 56, 0.3, 15.2, 0, 1.3, ["unidade", "unidades", 130], "maca"),
  F("Mamão papaia", "fruta", 40, 0.5, 10.4, 0.1, 1, ["fatia", "fatias", 100], "mamao"),
  F("Laranja pera", "fruta", 37, 1, 8.9, 0.1, 0.8, ["unidade", "unidades", 140], "laranja"),
  F("Morango", "fruta", 30, 0.9, 6.8, 0.3, 1.7, ["unidade", "unidades", 12], "morangos"),
  F("Abacaxi", "fruta", 48, 0.9, 12.3, 0.1, 1, ["fatia", "fatias", 75], "abacaxi"),
  F("Manga", "fruta", 51, 0.9, 12.8, 0.2, 2.1, ["fatia", "fatias", 80], "manga"),
  F("Melancia", "fruta", 33, 0.9, 8.1, 0, 0.1, ["fatia", "fatias", 200], "melancia"),
  F("Uva", "fruta", 53, 0.7, 13.6, 0.2, 0.9, ["cacho pequeno", "cachos pequenos", 100], "uvas"),
  F("Pera", "fruta", 53, 0.6, 14, 0.1, 3, ["unidade", "unidades", 130], "pera"),
  F("Kiwi", "fruta", 51, 1.3, 11.5, 0.6, 2.7, ["unidade", "unidades", 75], "kiwi"),
  F("Açaí (polpa sem açúcar)", "fruta", 58, 0.8, 6.2, 3.9, 2.6, ["pacote", "pacotes", 100], "acai"),
  F("Abacate", "fruta", 96, 1.2, 6, 8.4, 6.3, ["col. sopa", "col. sopa", 45], "abacate avocado"),
  // Laticínios
  F("Leite integral", "laticinio", 61, 3.2, 4.7, 3.3, 0, ["copo (200 ml)", "copos (200 ml)", 200], "leite"),
  F("Leite desnatado", "laticinio", 35, 3.4, 4.9, 0.2, 0, ["copo (200 ml)", "copos (200 ml)", 200], "leite desnatado semidesnatado"),
  F("Iogurte natural integral", "laticinio", 51, 4.1, 1.9, 3, 0, ["pote", "potes", 170], "iogurte"),
  F("Iogurte natural desnatado", "laticinio", 41, 3.8, 5.8, 0.3, 0, ["pote", "potes", 170], "iogurte desnatado"),
  F("Iogurte grego natural", "laticinio", 97, 9, 3.9, 5, 0, ["pote", "potes", 100], "grego"),
  F("Queijo minas frescal", "laticinio", 264, 17.4, 3.2, 20.2, 0, ["fatia", "fatias", 30], "queijo branco minas"),
  F("Queijo cottage", "laticinio", 98, 11.1, 3.4, 4.3, 0, ["col. sopa", "col. sopa", 30], "cottage"),
  F("Ricota", "laticinio", 140, 12.6, 3.8, 8.1, 0, ["fatia", "fatias", 30], "ricota"),
  F("Queijo muçarela", "laticinio", 330, 22.6, 3, 25.2, 0, ["fatia", "fatias", 15], "mussarela mozarela queijo"),
  // Gorduras boas
  F("Azeite de oliva", "gordura", 884, 0, 0, 100, 0, ["col. sopa", "col. sopa", 13], "azeite oleo"),
  F("Pasta de amendoim integral", "gordura", 588, 25, 20, 50, 6, ["col. sopa", "col. sopa", 15], "pasta amendoim"),
  F("Amendoim torrado", "gordura", 606, 22.5, 18.7, 54, 7.8, ["col. sopa", "col. sopa", 15], "amendoim"),
  F("Castanha-do-pará", "gordura", 643, 14.5, 15.1, 63.5, 7.9, ["unidade", "unidades", 4], "castanha para brasil"),
  F("Castanha de caju", "gordura", 570, 18.5, 29.1, 46.3, 3.7, ["unidade", "unidades", 2.5], "caju castanha"),
  F("Nozes", "gordura", 620, 14, 18.4, 59.4, 7.2, ["unidade", "unidades", 5], "noz"),
  F("Amêndoas", "gordura", 581, 18.6, 29.5, 47.3, 11.6, ["unidade", "unidades", 1.2], "amendoa"),
  F("Manteiga", "gordura", 726, 0.4, 0, 82.4, 0, ["col. chá", "col. chá", 5], "manteiga"),
  F("Chia", "gordura", 486, 16.5, 42.1, 30.7, 34.4, ["col. sopa", "col. sopa", 12], "chia"),
  F("Linhaça", "gordura", 495, 14.1, 43.3, 32.3, 33.5, ["col. sopa", "col. sopa", 10], "linhaca"),
  // Vegetais
  F("Brócolis cozido", "vegetal", 25, 2.1, 4.4, 0.5, 3.4, ["col. sopa", "col. sopa", 20], "brocolis"),
  F("Alface", "vegetal", 11, 1.3, 1.7, 0.2, 1.8, ["folha", "folhas", 10], "alface salada folhas"),
  F("Tomate", "vegetal", 15, 1.1, 3.1, 0.2, 1.2, ["unidade", "unidades", 100], "tomate"),
  F("Cenoura crua", "vegetal", 34, 1.3, 7.7, 0.2, 3.2, ["col. sopa ralada", "col. sopa ralada", 12], "cenoura"),
  F("Abobrinha cozida", "vegetal", 15, 1.1, 3, 0.2, 1.6, ["col. sopa", "col. sopa", 25], "abobrinha"),
  F("Pepino", "vegetal", 10, 0.9, 2, 0, 1.1, ["fatia", "fatias", 10], "pepino"),
  F("Couve crua", "vegetal", 27, 2.9, 4.3, 0.5, 3.1, ["folha", "folhas", 20], "couve"),
  F("Espinafre cozido", "vegetal", 23, 3, 3.8, 0.3, 2.4, ["col. sopa", "col. sopa", 25], "espinafre"),
  F("Beterraba cozida", "vegetal", 32, 1.3, 7.2, 0.1, 1.9, ["col. sopa", "col. sopa", 25], "beterraba"),
  F("Abóbora cabotiá cozida", "vegetal", 48, 1.4, 10.8, 0.7, 2.5, ["col. sopa", "col. sopa", 30], "abobora jerimum"),
  F("Chuchu cozido", "vegetal", 19, 0.4, 4.8, 0, 1, ["col. sopa", "col. sopa", 25], "chuchu"),
];

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

type Macros = { quantity_g: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };

/** Encontra o alimento da tabela mais parecido com o nome (ex.: "Frango grelhado em cubos" → Peito de frango grelhado). */
export function matchFood(name: string): FoodRef | null {
  const words = new Set(norm(name).split(" ").filter((w) => w.length > 2));
  let best: FoodRef | null = null;
  let bestScore = 0;
  for (const f of FOODS) {
    const fw = norm(`${f.name} ${f.alias ?? ""}`).split(" ").filter((w) => w.length > 2);
    const hits = fw.filter((w) => words.has(w)).length;
    const score = hits / Math.max(3, fw.length) + hits;
    if (hits && score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

/** Grupo do alimento atual: pela tabela ou, se não achar, pelo macronutriente que mais pesa. */
export function guessGroup(food: Pick<Macros, "calories" | "protein_g" | "carbs_g" | "fat_g"> & { name: string }): FoodGroup {
  const m = matchFood(food.name);
  if (m) return m.group;
  const kp = food.protein_g * 4, kc = food.carbs_g * 4, kg = food.fat_g * 9;
  const total = kp + kc + kg || 1;
  if (kg / total > 0.55) return "gordura";
  if (kp / total > 0.4) return "proteina";
  if (food.calories < 40) return "vegetal";
  return "carboidrato";
}

const keyOf = (m: Macros, k: "p" | "c" | "g" | "kcal") => (k === "p" ? m.protein_g : k === "c" ? m.carbs_g : k === "g" ? m.fat_g : m.calories);
const keyRef = (f: FoodRef, k: "p" | "c" | "g" | "kcal") => (k === "kcal" ? f.kcal : f[k]);

const roundQty = (q: number) => (q < 20 ? Math.max(1, Math.round(q)) : q < 100 ? Math.round(q / 5) * 5 : Math.round(q / 10) * 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function householdFor(f: FoodRef, qty: number): string | null {
  if (!f.unit) return null;
  const [one, many, g] = f.unit;
  const n = qty / g;
  const half = Math.round(n * 2) / 2;
  if (half < 0.5) return null;
  const txt = Number.isInteger(half) ? String(half) : half === 0.5 ? "½" : `${Math.floor(half)} e ½`;
  return `${txt} ${half <= 1 ? one : many}`;
}

/** Valores de um alimento da tabela em uma quantidade. */
export function macrosOf(f: FoodRef, qty: number) {
  const k = qty / 100;
  return { quantity_g: qty, calories: r1(f.kcal * k), protein_g: r1(f.p * k), carbs_g: r1(f.c * k), fat_g: r1(f.g * k), fiber_g: r1(f.f * k), household_measure: householdFor(f, qty) };
}

export type Swap = ReturnType<typeof macrosOf> & { food: FoodRef; diffKcal: number; basis: string };

const BASIS: Record<string, string> = { p: "mesma proteína", c: "mesmo carboidrato", g: "mesma gordura", kcal: "mesmas calorias" };

/**
 * Calcula a porção equivalente de `to` para substituir `from`.
 * Dentro do mesmo grupo iguala o nutriente principal do grupo; entre grupos diferentes iguala as calorias.
 */
export function equivalent(from: Macros, fromGroup: FoodGroup, to: FoodRef): Swap | null {
  let k: "p" | "c" | "g" | "kcal" = to.group === fromGroup ? GROUP_KEY[fromGroup] : "kcal";
  if (keyOf(from, k) <= 0.5 || keyRef(to, k) <= 0.5) k = "kcal";
  const base = keyOf(from, k);
  const per = keyRef(to, k);
  if (base <= 0 || per <= 0) return null;
  const qty = roundQty((base / per) * 100);
  const m = macrosOf(to, qty);
  return { ...m, food: to, diffKcal: Math.round(m.calories - from.calories), basis: BASIS[k] };
}

/** Lista de trocas ordenada pela semelhança nutricional com o alimento original. */
export function swapsFor(from: Macros & { name: string }, group: FoodGroup, opts: { query?: string; anyGroup?: boolean } = {}): Swap[] {
  const q = opts.query ? norm(opts.query) : "";
  const current = matchFood(from.name);
  return FOODS.filter((f) => f !== current && (q ? norm(`${f.name} ${f.alias ?? ""}`).includes(q) : opts.anyGroup || f.group === group))
    .map((f) => equivalent(from, group, f))
    .filter((s): s is Swap => !!s && s.quantity_g <= 1000)
    .sort((a, b) => score(from, a) - score(from, b));
}

function score(from: Macros, s: Swap) {
  const d = (a: number, b: number) => Math.abs(a - b);
  return d(from.calories, s.calories) / 10 + d(from.protein_g, s.protein_g) + d(from.carbs_g, s.carbs_g) / 2 + d(from.fat_g, s.fat_g);
}

/** Recalcula os valores de um alimento para outra quantidade (proporcional). */
export function scaleFood<T extends Macros>(f: T, qty: number) {
  const k = f.quantity_g > 0 ? qty / f.quantity_g : 0;
  return { quantity_g: qty, calories: r1(f.calories * k), protein_g: r1(f.protein_g * k), carbs_g: r1(f.carbs_g * k), fat_g: r1(f.fat_g * k), fiber_g: r1(f.fiber_g * k) };
}

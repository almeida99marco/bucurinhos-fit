// Camada de dados do Bucurinho's Fit.
// - Com VITE_SUPABASE_URL configurada: usa Supabase (Auth, Postgres com RLS, Storage, Edge Functions).
// - Dentro do Claude (artefato): banco do artefato + IA do Claude (artifactBackend.ts).
// - Sem configuração: modo de prévia local (dados salvos neste navegador), útil para testar a interface.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { EXERCISE_LIBRARY } from "./exerciseLibrary";
import { inClaude } from "./claudeRuntime";

export type AuthUser = { id: string; email: string };

export type Query = {
  eq?: Record<string, unknown>;
  gte?: Record<string, unknown>;
  lte?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  order?: [string, "asc" | "desc"][];
  limit?: number;
  /** Ler dados de outro usuário que compartilhou com você (respeita RLS). */
  ownerId?: string;
};

export interface Backend {
  mode: "supabase" | "local" | "artifact";
  auth: {
    getUser(): Promise<AuthUser | null>;
    onChange(cb: (u: AuthUser | null, event?: string) => void): () => void;
    signUp(email: string, password: string, meta: Record<string, string>): Promise<{ needsConfirmation: boolean }>;
    signIn(email: string, password: string): Promise<void>;
    signOut(): Promise<void>;
    resetPassword(email: string): Promise<void>;
    updatePassword(password: string): Promise<void>;
  };
  list<T = any>(table: string, q?: Query): Promise<T[]>;
  get<T = any>(table: string, id: string): Promise<T | null>;
  insert<T = any>(table: string, row: Record<string, unknown>): Promise<T>;
  insertMany<T = any>(table: string, rows: Record<string, unknown>[]): Promise<T[]>;
  update<T = any>(table: string, id: string, patch: Record<string, unknown>): Promise<T>;
  remove(table: string, id: string): Promise<void>;
  removeWhere(table: string, eq: Record<string, unknown>): Promise<void>;
  upload(bucket: string, path: string, file: Blob): Promise<string>;
  fileUrl(bucket: string, path: string): Promise<string>;
  removeFile(bucket: string, path: string): Promise<void>;
  fn<T = any>(name: string, body: unknown): Promise<T>;
  rpc<T = any>(name: string, args: Record<string, unknown>): Promise<T>;
}

/** Tabelas que não são filtradas por user_id. */
const NOT_USER_SCOPED = new Set(["profiles", "exercise_library", "data_shares"]);

/** URL pública do app (considera o subcaminho do GitHub Pages). */
const appUrl = (path = "") => `${window.location.origin}${(import.meta as any).env?.BASE_URL ?? "/"}${path}`;

// ======================================================================
// SUPABASE
// ======================================================================
function supabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storage: localStorage, flowType: "pkce", detectSessionInUrl: true },
  });
  let currentId: string | null = null;
  const uid = async () => {
    if (currentId) return currentId;
    const { data } = await sb.auth.getUser();
    currentId = data.user?.id ?? null;
    if (!currentId) throw new Error("Sessão expirada. Entre novamente.");
    return currentId;
  };
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(translateError(e.message));
  };

  return {
    mode: "supabase",
    auth: {
      async getUser() {
        const { data } = await sb.auth.getSession();
        const u = data.session?.user;
        currentId = u?.id ?? null;
        return u ? { id: u.id, email: u.email ?? "" } : null;
      },
      onChange(cb) {
        const { data } = sb.auth.onAuthStateChange((event, session) => {
          const u = session?.user;
          currentId = u?.id ?? null;
          cb(u ? { id: u.id, email: u.email ?? "" } : null, event);
        });
        return () => data.subscription.unsubscribe();
      },
      async signUp(email, password, meta) {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: meta, emailRedirectTo: appUrl() },
        });
        fail(error);
        return { needsConfirmation: !data.session };
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        fail(error);
      },
      async signOut() {
        currentId = null;
        await sb.auth.signOut();
      },
      async resetPassword(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: appUrl("redefinir-senha"),
        });
        fail(error);
      },
      async updatePassword(password) {
        const { error } = await sb.auth.updateUser({ password });
        fail(error);
      },
    },
    async list(table, q = {}) {
      let query: any = sb.from(table).select("*");
      if (!NOT_USER_SCOPED.has(table)) query = query.eq("user_id", q.ownerId ?? (await uid()));
      for (const [k, v] of Object.entries(q.eq ?? {})) query = v === null ? query.is(k, null) : query.eq(k, v);
      for (const [k, v] of Object.entries(q.gte ?? {})) query = query.gte(k, v);
      for (const [k, v] of Object.entries(q.lte ?? {})) query = query.lte(k, v);
      for (const [k, v] of Object.entries(q.in ?? {})) query = query.in(k, v);
      for (const [k, dir] of q.order ?? []) query = query.order(k, { ascending: dir === "asc" });
      if (q.limit) query = query.limit(q.limit);
      const { data, error } = await query;
      fail(error);
      return data ?? [];
    },
    async get(table, id) {
      const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
      fail(error);
      return data;
    },
    async insert(table, row) {
      const payload = NOT_USER_SCOPED.has(table) && table !== "exercise_library" ? row : { user_id: await uid(), ...row };
      const { data, error } = await sb.from(table).insert(payload).select().single();
      fail(error);
      return data;
    },
    async insertMany(table, rows) {
      if (!rows.length) return [];
      const id = await uid();
      const { data, error } = await sb.from(table).insert(rows.map((r) => ({ user_id: id, ...r }))).select();
      fail(error);
      return data ?? [];
    },
    async update(table, id, patch) {
      const { data, error } = await sb.from(table).update(patch).eq("id", id).select().single();
      fail(error);
      return data;
    },
    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq("id", id);
      fail(error);
    },
    async removeWhere(table, eq) {
      let query: any = sb.from(table).delete();
      if (!NOT_USER_SCOPED.has(table)) query = query.eq("user_id", await uid());
      for (const [k, v] of Object.entries(eq)) query = query.eq(k, v);
      const { error } = await query;
      fail(error);
    },
    async upload(bucket, path, file) {
      const full = `${await uid()}/${path}`;
      const { error } = await sb.storage.from(bucket).upload(full, file, { upsert: true, contentType: file.type });
      fail(error);
      return full;
    },
    async fileUrl(bucket, path) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60);
      fail(error);
      return data!.signedUrl;
    },
    async removeFile(bucket, path) {
      const { error } = await sb.storage.from(bucket).remove([path]);
      fail(error);
    },
    async fn(name, body) {
      const { data, error } = await sb.functions.invoke(name, { body: body as Record<string, unknown> });
      if (error) {
        let msg = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) msg = ctx.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async rpc(name, args) {
      const { data, error } = await sb.rpc(name, args);
      fail(error);
      return data;
    },
  };
}

function translateError(msg: string): string {
  const map: [RegExp, string][] = [
    [/Invalid login credentials/i, "E-mail ou senha incorretos."],
    [/User already registered/i, "Este e-mail já está cadastrado."],
    [/Email not confirmed/i, "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada)."],
    [/Password should be at least/i, "A senha deve ter pelo menos 6 caracteres."],
    [/rate limit/i, "Muitas tentativas. Aguarde alguns minutos."],
    [/row-level security/i, "Você não tem permissão para esta ação."],
    [/Failed to fetch/i, "Sem conexão com o servidor. Verifique sua internet."],
  ];
  for (const [re, pt] of map) if (re.test(msg)) return pt;
  return msg;
}

// ======================================================================
// PRÉVIA LOCAL (sem servidor) — mesmas regras de isolamento por usuário
// ======================================================================
const mem: Record<string, string> = {};
const ls = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return mem[k] ?? null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      if ((e as Error)?.name === "QuotaExceededError") throw new Error("Armazenamento do navegador cheio. Na versão com Supabase não há esse limite.");
      mem[k] = v;
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      delete mem[k];
    }
  },
};
const P = "bfit:";
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

const CASCADE: Record<string, [string, string][]> = {
  meal_plans: [["meals", "plan_id"]],
  meals: [["food_items", "meal_id"]],
  workout_plans: [["workout_days", "plan_id"]],
  workout_days: [["exercises", "workout_day_id"]],
  workout_sessions: [["workout_sets", "session_id"]],
};

const SHARE_SCOPE: Record<string, string> = {
  nutrition_profiles: "nutricao", meal_plans: "nutricao", meals: "nutricao", food_items: "nutricao", meal_logs: "nutricao",
  workout_plans: "treinos", workout_days: "treinos", exercises: "treinos", workout_sessions: "treinos", workout_sets: "treinos",
  running_sessions: "corrida", running_goals: "corrida", body_measurements: "evolucao", progress_photos: "fotos",
};

async function hash(s: string) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fitlife:" + s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0;
    for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return "h" + h;
  }
}

function localBackend(): Backend {
  const read = (t: string): any[] => JSON.parse(ls.get(P + t) ?? "[]");
  const write = (t: string, rows: any[]) => ls.set(P + t, JSON.stringify(rows));
  const listeners = new Set<(u: AuthUser | null, e?: string) => void>();
  const current = (): AuthUser | null => JSON.parse(ls.get(P + "session") ?? "null");
  const need = () => {
    const u = current();
    if (!u) throw new Error("Sessão expirada. Entre novamente.");
    return u;
  };
  const emit = (e: string) => listeners.forEach((l) => l(current(), e));

  if (!ls.get(P + "exercise_library")) {
    write(
      "exercise_library",
      EXERCISE_LIBRARY.map((e) => ({ id: uuid(), user_id: null, media_url: null, created_at: new Date().toISOString(), ...e })),
    );
  }

  const canView = (owner: string, scope: string) =>
    read("data_shares").some((s) => s.user_id === owner && s.viewer_id === current()?.id && s.scopes.includes(scope));

  const visible = (table: string, r: any, me: string) => {
    if (table === "profiles") return r.id === me || read("data_shares").some((s) => s.user_id === r.id && s.viewer_id === me);
    if (table === "exercise_library") return r.user_id == null || r.user_id === me;
    if (table === "data_shares") return r.user_id === me || r.viewer_id === me;
    return r.user_id === me || (SHARE_SCOPE[table] && canView(r.user_id, SHARE_SCOPE[table]));
  };

  const cmp = (a: any, b: any) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

  const removeCascade = (table: string, ids: string[]) => {
    write(table, read(table).filter((r) => !ids.includes(r.id)));
    for (const [child, fk] of CASCADE[table] ?? []) {
      const childIds = read(child).filter((r) => ids.includes(r[fk])).map((r) => r.id);
      if (childIds.length) removeCascade(child, childIds);
    }
  };

  const be: Backend = {
    mode: "local",
    auth: {
      async getUser() {
        return current();
      },
      onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      async signUp(email, password, meta) {
        email = email.trim().toLowerCase();
        if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
        const users = read("_users");
        if (users.some((u) => u.email === email)) throw new Error("Este e-mail já está cadastrado.");
        const id = uuid();
        users.push({ id, email, pw: await hash(password) });
        write("_users", users);
        const now = new Date().toISOString();
        write("profiles", [
          ...read("profiles"),
          {
            id, email, full_name: meta.full_name ?? "", sex: meta.sex || null, running_enabled: meta.sex === "masculino",
            avatar_url: null, birth_date: null, height_cm: null, weight_kg: null, goal_weight_kg: null, activity_level: null,
            fitness_goals: null, water_goal_ml: 2500, onboarded: false, accent_color: "verde", created_at: now, updated_at: now,
          },
        ]);
        ls.set(P + "session", JSON.stringify({ id, email }));
        emit("SIGNED_IN");
        return { needsConfirmation: false };
      },
      async signIn(email, password) {
        const u = read("_users").find((x) => x.email === email.trim().toLowerCase());
        if (!u || u.pw !== (await hash(password))) throw new Error("E-mail ou senha incorretos.");
        ls.set(P + "session", JSON.stringify({ id: u.id, email: u.email }));
        emit("SIGNED_IN");
      },
      async signOut() {
        ls.del(P + "session");
        emit("SIGNED_OUT");
      },
      async resetPassword() {
        throw new Error("Na prévia local não há envio de e-mail. A recuperação de senha funciona com o Supabase conectado.");
      },
      async updatePassword(password) {
        const me = need();
        if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
        const pw = await hash(password);
        write("_users", read("_users").map((u) => (u.id === me.id ? { ...u, pw } : u)));
      },
    },
    async list(table, q = {}) {
      const me = need().id;
      let rows = read(table).filter((r) => visible(table, r, me));
      if (!NOT_USER_SCOPED.has(table)) rows = rows.filter((r) => r.user_id === (q.ownerId ?? me));
      for (const [k, v] of Object.entries(q.eq ?? {})) rows = rows.filter((r) => (r[k] ?? null) === v);
      for (const [k, v] of Object.entries(q.gte ?? {})) rows = rows.filter((r) => r[k] != null && r[k] >= (v as any));
      for (const [k, v] of Object.entries(q.lte ?? {})) rows = rows.filter((r) => r[k] != null && r[k] <= (v as any));
      for (const [k, v] of Object.entries(q.in ?? {})) rows = rows.filter((r) => v.includes(r[k]));
      const order = q.order ?? [];
      if (order.length)
        rows.sort((a, b) => {
          for (const [k, dir] of order) {
            const c = cmp(a[k], b[k]);
            if (c) return dir === "asc" ? c : -c;
          }
          return 0;
        });
      if (q.limit) rows = rows.slice(0, q.limit);
      return rows;
    },
    async get(table, id) {
      const me = need().id;
      return read(table).find((r) => r.id === id && visible(table, r, me)) ?? null;
    },
    async insert(table, row) {
      return (await be.insertMany(table, [row]))[0];
    },
    async insertMany(table, rowsIn) {
      const me = need().id;
      const now = new Date().toISOString();
      const rows = rowsIn.map((r) => ({ id: uuid(), created_at: now, ...(NOT_USER_SCOPED.has(table) && table !== "exercise_library" ? {} : { user_id: me }), ...r }));
      if (rows.some((r) => "user_id" in r && r.user_id !== me && table !== "data_shares")) throw new Error("Você não tem permissão para esta ação.");
      write(table, [...read(table), ...rows]);
      return rows as any;
    },
    async update(table, id, patch) {
      const me = need().id;
      const rows = read(table);
      const i = rows.findIndex((r) => r.id === id);
      const owner = table === "profiles" ? rows[i]?.id : rows[i]?.user_id;
      if (i < 0 || owner !== me) throw new Error("Registro não encontrado ou sem permissão.");
      rows[i] = { ...rows[i], ...patch, ...(table === "profiles" || "updated_at" in rows[i] ? { updated_at: new Date().toISOString() } : {}) };
      write(table, rows);
      return rows[i];
    },
    async remove(table, id) {
      const me = need().id;
      const r = read(table).find((x) => x.id === id);
      if (!r || (r.user_id !== me && r.viewer_id !== me)) throw new Error("Registro não encontrado ou sem permissão.");
      removeCascade(table, [id]);
    },
    async removeWhere(table, eq) {
      const me = need().id;
      const ids = read(table)
        .filter((r) => (NOT_USER_SCOPED.has(table) ? true : r.user_id === me) && Object.entries(eq).every(([k, v]) => r[k] === v))
        .map((r) => r.id);
      removeCascade(table, ids);
    },
    async upload(bucket, path, file) {
      const me = need().id;
      const full = `${me}/${path}`;
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      ls.set(`${P}file:${bucket}/${full}`, dataUrl);
      return full;
    },
    async fileUrl(bucket, path) {
      const me = need().id;
      const owner = path.split("/")[0];
      if (owner !== me && !(bucket === "progress-photos" ? canView(owner, "fotos") : read("data_shares").some((s) => s.user_id === owner && s.viewer_id === me)))
        throw new Error("Sem permissão para este arquivo.");
      return ls.get(`${P}file:${bucket}/${path}`) ?? "";
    },
    async removeFile(bucket, path) {
      ls.del(`${P}file:${bucket}/${path}`);
    },
    async fn() {
      throw new Error("A IA funciona quando o app está conectado ao Supabase/Lovable Cloud (a chave fica protegida no servidor). Nesta prévia local, use o cadastro manual.");
    },
    async rpc(name, args) {
      const me = need().id;
      if (name === "share_with_email") {
        const target = read("profiles").find((p) => p.email?.toLowerCase() === String(args.p_email).trim().toLowerCase());
        if (!target) throw new Error("Nenhum usuário encontrado com este e-mail");
        if (target.id === me) throw new Error("Você não pode compartilhar com você mesmo");
        const shares = read("data_shares");
        const ex = shares.find((s) => s.user_id === me && s.viewer_id === target.id);
        if (ex) ex.scopes = args.p_scopes;
        else shares.push({ id: uuid(), user_id: me, viewer_id: target.id, scopes: args.p_scopes, created_at: new Date().toISOString() });
        write("data_shares", shares);
        return (ex ?? shares[shares.length - 1]).id;
      }
      if (name === "shared_profiles") {
        const profiles = read("profiles");
        return read("data_shares")
          .filter((s) => s.user_id === me || s.viewer_id === me)
          .map((s) => {
            const incoming = s.viewer_id === me;
            const p = profiles.find((x) => x.id === (incoming ? s.user_id : s.viewer_id));
            return { id: p?.id, full_name: p?.full_name, email: p?.email, direction: incoming ? "incoming" : "outgoing", scopes: s.scopes, share_id: s.id };
          }) as any;
      }
      throw new Error("Função indisponível na prévia local.");
    },
  };
  return be;
}

const env = (import.meta as any).env ?? {};
const URL_ = env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** Backend ativo. Dentro do Claude usa o banco do artefato; com Supabase configurado usa o Supabase; senão, prévia local. */
export let backend: Backend = null as unknown as Backend;
export let isLocal = false;
export let isClaude = false;

export async function initBackend() {
  if (URL_ && KEY_) backend = supabaseBackend(URL_, KEY_);
  else {
    let b: Backend | null = null;
    if (inClaude()) {
      const { createArtifactBackend } = await import("./artifactBackend");
      b = await createArtifactBackend().catch(() => null);
    }
    backend = b ?? localBackend();
  }
  isLocal = backend.mode === "local";
  isClaude = backend.mode === "artifact";
  return backend;
}

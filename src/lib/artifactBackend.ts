// Backend do Bucurinho's Fit rodando dentro do Claude (artefato no claude.ai).
// - Identidade: conta Claude de quem abre o app (capacidade `user`).
// - Dados: banco do artefato (capacidade `db`), na área privada de cada pessoa
//   `data/users/<id>/...`, que nenhuma outra pessoa (nem o dono do app) consegue ler.
// - Compartilhamento: só o que a pessoa autorizar é copiado para `shares/<id>`, legível
//   por quem tem acesso ao app e gravável apenas pela própria pessoa.
// - IA: Claude, via capacidade `sample` (ver claudeAI.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuthUser, Backend, Query } from "./backend";
import { applyQuery, CASCADE, SHARE_SCOPE } from "./query";
import { useCap } from "./claudeRuntime";
import { EXERCISE_LIBRARY } from "./exerciseLibrary";

type TableCache = { rows: Map<string, any>; chunkOf: Map<string, string>; loadedAt: number };

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

const PER_ROW = new Set(["progress_photos", "files"]);
const CHUNK_LIMIT = 180_000; // bytes por documento (o limite da plataforma é 256 KiB)
const TTL = 15_000;
const SYSTEM_LIBRARY = EXERCISE_LIBRARY.map((e, i) => ({ id: `sys-${i}`, user_id: null, media_url: null, created_at: "2026-01-01T00:00:00.000Z", ...e }));

function dbError(e: any): Error {
  const code = e?.code;
  if (code === "quota_exceeded") return new Error("O armazenamento do app está cheio. Exclua registros antigos (por exemplo, fotos) para continuar.");
  if (code === "invalid_argument") return new Error("Sem permissão para salvar. Peça a quem compartilhou o app para te dar acesso de Editor.");
  if (code === "resource_exhausted") return new Error("Muitas operações seguidas. Aguarde alguns segundos e tente de novo.");
  if (code === "revoked") return new Error("Seu acesso a este app foi alterado. Recarregue a página.");
  return new Error(e?.message && !code ? e.message : "Não foi possível acessar seus dados agora. Verifique a conexão e tente novamente.");
}

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("Não foi possível ler o arquivo."));
    fr.readAsDataURL(b);
  });
}

/** Reduz uma imagem (dataURL) até caber no limite indicado. */
export async function shrinkDataUrl(dataUrl: string, maxChars: number, startPx = 1080): Promise<string> {
  if (dataUrl.length <= maxChars || !dataUrl.startsWith("data:image")) return dataUrl;
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Imagem inválida."));
    i.src = dataUrl;
  });
  let px = startPx;
  let q = 0.78;
  for (let k = 0; k < 8; k++) {
    const s = Math.min(1, px / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * s));
    c.height = Math.max(1, Math.round(img.height * s));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", q);
    if (out.length <= maxChars) return out;
    px = Math.round(px * 0.8);
    q = Math.max(0.5, q - 0.06);
  }
  throw new Error("Não foi possível reduzir a imagem o suficiente. Tente outra foto.");
}

export async function createArtifactBackend(): Promise<Backend | null> {
  const db = await useCap<any>("db");
  const user = await useCap<any>("user");
  if (!db || !user) return null;
  const uid: string | null = await user.id();
  if (!uid) return null;
  const me = await user.me();
  const root = `data/users/${uid}`;

  // ------------------------------------------------------------- cache + chunks
  const caches = new Map<string, Promise<TableCache>>();
  const pending = new Map<string, number>();
  const queues = new Map<string, Promise<void>>();

  const chunks = (table: string) => db.doc(`${root}/${table}`).collection("c");

  async function fetchTable(table: string): Promise<TableCache> {
    let snap;
    try {
      snap = await chunks(table).get();
    } catch (e) {
      throw dbError(e);
    }
    const c: TableCache = { rows: new Map(), chunkOf: new Map(), loadedAt: Date.now() };
    for (const d of snap.docs) {
      const body = d.data() ?? {};
      for (const [id, row] of Object.entries((body.rows ?? {}) as Record<string, any>)) {
        c.rows.set(id, row);
        c.chunkOf.set(id, d.id);
      }
    }
    return c;
  }

  function load(table: string): Promise<TableCache> {
    const cur = caches.get(table);
    if (cur) {
      return cur.then((c) => {
        if (Date.now() - c.loadedAt > TTL && !pending.get(table)) {
          const p = fetchTable(table);
          caches.set(table, p);
          p.catch(() => caches.set(table, Promise.resolve(c)));
          return p.catch(() => c);
        }
        return c;
      });
    }
    const p = fetchTable(table);
    caches.set(table, p);
    p.catch(() => caches.delete(table));
    return p;
  }

  function chunkFor(table: string, row: any, c: TableCache) {
    if (table === "profiles") return "main";
    if (PER_ROW.has(table)) return row.id;
    const month = String(row.created_at ?? new Date().toISOString()).slice(0, 7);
    for (let k = 0; k < 50; k++) {
      const id = k ? `${month}~${k}` : month;
      let size = 0;
      for (const [rid, ch] of c.chunkOf) if (ch === id) size += JSON.stringify(c.rows.get(rid)).length;
      if (size + JSON.stringify(row).length < CHUNK_LIMIT) return id;
    }
    return `${month}~${uuid().slice(0, 8)}`;
  }

  function writeChunk(table: string, chunkId: string, c: TableCache): Promise<void> {
    const key = `${table}/${chunkId}`;
    pending.set(table, (pending.get(table) ?? 0) + 1);
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const rows: Record<string, any> = {};
        for (const [id, ch] of c.chunkOf) if (ch === chunkId) rows[id] = c.rows.get(id);
        const ref = chunks(table).doc(chunkId);
        try {
          if (Object.keys(rows).length) await ref.set({ rows });
          else await ref.delete();
        } catch (e) {
          throw dbError(e);
        }
      })
      .finally(() => pending.set(table, Math.max(0, (pending.get(table) ?? 1) - 1)));
    queues.set(key, next);
    return next;
  }

  // ------------------------------------------------------------- compartilhamento
  let shareTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleShare = (table: string) => {
    if (!(table in SHARE_SCOPE) && table !== "profiles") return;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => publishShare().catch(() => undefined), 2500);
  };

  async function thumb(dataUrl: string) {
    return shrinkDataUrl(dataUrl, 30_000, 360).catch(() => "");
  }

  async function publishShare() {
    const profile = (await load("profiles")).rows.get(uid!);
    const scopes: string[] = profile?.share_scopes ?? [];
    const ref = db.doc(`shares/${uid}`);
    if (!scopes.length) {
      await ref.delete().catch(() => undefined);
      return;
    }
    const all = async (t: string) => Array.from((await load(t)).rows.values());
    const tables: Record<string, any[]> = {};
    const files: Record<string, string> = {};
    if (scopes.includes("evolucao")) tables.body_measurements = (await all("body_measurements")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150);
    if (scopes.includes("treinos")) tables.workout_sessions = (await all("workout_sessions")).filter((s) => s.finished_at).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 30);
    if (scopes.includes("corrida")) tables.running_sessions = (await all("running_sessions")).filter((r) => r.status === "done").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
    if (scopes.includes("nutricao")) {
      const plans = (await all("meal_plans")).filter((p) => p.status === "active");
      const ids = new Set(plans.map((p) => p.id));
      const meals = (await all("meals")).filter((m) => ids.has(m.plan_id));
      const mids = new Set(meals.map((m) => m.id));
      tables.meal_plans = plans;
      tables.meals = meals;
      tables.food_items = (await all("food_items")).filter((f) => mids.has(f.meal_id)).map(({ alternatives, ...f }) => f);
    }
    if (scopes.includes("fotos")) {
      const photos = (await all("progress_photos")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
      const fileRows = (await load("files")).rows;
      tables.progress_photos = [];
      for (const p of photos) {
        const f = fileRows.get(String(p.storage_path).split("/")[1]);
        const t = f ? await thumb(f.data) : "";
        if (t) {
          files[p.storage_path] = t;
          tables.progress_photos.push(p);
        }
      }
    }
    const body = { owner: uid, name: profile?.full_name ?? "", scopes, updated_at: new Date().toISOString(), tables, files };
    while (JSON.stringify(body).length > 240_000 && tables.progress_photos?.length) {
      const p = tables.progress_photos.pop();
      delete files[p.storage_path];
    }
    await ref.set(body);
  }

  async function snapshotOf(owner: string) {
    try {
      const s = await db.doc(`shares/${owner}`).get();
      return s.exists ? (s.data() as any) : null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------- operações
  const now = () => new Date().toISOString();

  async function removeIds(table: string, ids: string[]) {
    if (!ids.length) return;
    const c = await load(table);
    const touched = new Set<string>();
    for (const id of ids) {
      const ch = c.chunkOf.get(id);
      if (!ch) continue;
      c.rows.delete(id);
      c.chunkOf.delete(id);
      touched.add(ch);
    }
    await Promise.all(Array.from(touched).map((ch) => writeChunk(table, ch, c)));
    for (const [child, fk] of CASCADE[table] ?? []) {
      const cc = await load(child);
      const childIds = Array.from(cc.rows.values()).filter((r) => ids.includes(r[fk])).map((r) => r.id);
      await removeIds(child, childIds);
    }
    scheduleShare(table);
  }

  const be: Backend = {
    mode: "artifact",
    auth: {
      async getUser(): Promise<AuthUser> {
        return { id: uid, email: me?.email ?? "" };
      },
      onChange() {
        return () => undefined;
      },
      async signUp() {
        throw new Error("No Claude, você entra com a sua conta Claude.");
      },
      async signIn() {
        throw new Error("No Claude, você entra com a sua conta Claude.");
      },
      async signOut() {
        /* a sessão é a da conta Claude */
      },
      async resetPassword() {
        throw new Error("No Claude, a senha é a da sua conta Claude.");
      },
      async updatePassword() {
        throw new Error("No Claude, a senha é a da sua conta Claude.");
      },
    },

    async list(table, q: Query = {}) {
      if (q.ownerId && q.ownerId !== uid) {
        const snap = await snapshotOf(q.ownerId);
        return applyQuery((snap?.tables?.[table] ?? []) as any[], { ...q, ownerId: undefined });
      }
      if (table === "data_shares") return [];
      let rows = Array.from((await load(table)).rows.values());
      if (table === "exercise_library") rows = [...SYSTEM_LIBRARY, ...rows];
      return applyQuery(rows, q);
    },

    async get(table, id) {
      if (table === "exercise_library" && id.startsWith("sys-")) return SYSTEM_LIBRARY.find((r) => r.id === id) ?? null;
      return (await load(table)).rows.get(id) ?? null;
    },

    async insert(table, row) {
      return (await be.insertMany(table, [row]))[0];
    },

    async insertMany(table, rowsIn) {
      if (!rowsIn.length) return [];
      const c = await load(table);
      const ts = now();
      const created = rowsIn.map((r) => {
        const row: any = { id: uuid(), created_at: ts, ...r, user_id: table === "profiles" ? undefined : uid };
        if (table === "profiles") row.id = uid;
        if (table === "profiles" || table === "nutrition_profiles") row.updated_at = ts;
        return row;
      });
      const touched = new Set<string>();
      for (const row of created) {
        const ch = chunkFor(table, row, c);
        c.rows.set(row.id, row);
        c.chunkOf.set(row.id, ch);
        touched.add(ch);
      }
      try {
        await Promise.all(Array.from(touched).map((ch) => writeChunk(table, ch, c)));
      } catch (e) {
        for (const row of created) {
          c.rows.delete(row.id);
          c.chunkOf.delete(row.id);
        }
        throw e;
      }
      scheduleShare(table);
      return created;
    },

    async update(table, id, patch) {
      const c = await load(table);
      const cur = c.rows.get(id);
      if (!cur) throw new Error("Registro não encontrado.");
      const next = { ...cur, ...patch, id: cur.id, user_id: cur.user_id };
      if ("updated_at" in cur) next.updated_at = now();
      c.rows.set(id, next);
      try {
        await writeChunk(table, c.chunkOf.get(id)!, c);
      } catch (e) {
        c.rows.set(id, cur);
        throw e;
      }
      scheduleShare(table);
      return next;
    },

    async remove(table, id) {
      if (table === "data_shares") {
        await be.update("profiles", uid, { share_scopes: [] });
        await publishShare();
        return;
      }
      await removeIds(table, [id]);
    },

    async removeWhere(table, eq) {
      const rows = applyQuery(Array.from((await load(table)).rows.values()), { eq });
      await removeIds(table, rows.map((r) => r.id));
    },

    async upload(_bucket, _path, file) {
      let data = await blobToDataUrl(file);
      data = await shrinkDataUrl(data, 220_000);
      const row = await be.insert<{ id: string }>("files", { bucket: _bucket, data });
      return `${uid}/${row.id}`;
    },

    async fileUrl(_bucket, path) {
      const [owner, fileId] = path.split("/");
      if (owner === uid) return ((await load("files")).rows.get(fileId)?.data as string) ?? "";
      const snap = await snapshotOf(owner);
      const f = snap?.files?.[path];
      if (!f) throw new Error("Sem permissão para este arquivo.");
      return f;
    },

    async removeFile(_bucket, path) {
      const [owner, fileId] = path.split("/");
      if (owner === uid) await removeIds("files", [fileId]);
    },

    async fn(name, body) {
      const ai = await import("./claudeAI");
      return ai.runAI(name, body as any, be) as any;
    },

    async rpc(name, args) {
      if (name === "shared_profiles") {
        let docs: any[] = [];
        try {
          docs = (await db.collection("shares").get()).docs;
        } catch {
          docs = [];
        }
        const out: any[] = [];
        for (const d of docs) {
          const s = d.data() ?? {};
          if (!Array.isArray(s.scopes) || !s.scopes.length) continue;
          if (d.id === uid) out.push({ id: "todos", full_name: "Todas as pessoas com acesso ao app", email: "", direction: "outgoing", scopes: s.scopes, share_id: uid });
          else out.push({ id: d.id, full_name: String(s.name || ""), email: "", direction: "incoming", scopes: s.scopes, share_id: d.id });
        }
        return out as any;
      }
      if (name === "set_share_scopes") {
        await be.update("profiles", uid, { share_scopes: (args.p_scopes as string[]) ?? [] });
        await publishShare();
        return true as any;
      }
      throw new Error("Função indisponível.");
    },
  };

  // Garante o perfil da pessoa na primeira abertura
  const profiles = await load("profiles");
  if (!profiles.rows.get(uid)) {
    await be.insert("profiles", {
      email: me?.email ?? "",
      full_name: me?.name ?? "",
      avatar_url: null,
      birth_date: null,
      sex: null,
      height_cm: null,
      weight_kg: null,
      goal_weight_kg: null,
      activity_level: null,
      fitness_goals: null,
      running_enabled: false,
      water_goal_ml: 2500,
      onboarded: false,
      accent_color: "verde",
      share_scopes: [],
    });
  }
  return be;
}

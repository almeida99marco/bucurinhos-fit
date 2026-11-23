// Utilidades compartilhadas pelas Edge Functions de IA.
// A chave da API de IA fica somente no servidor (secrets do Supabase), nunca no frontend.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Cliente Supabase autenticado como o usuário que fez a chamada (RLS continua valendo). */
export async function getUserClient(req: Request): Promise<{ supabase: SupabaseClient; userId: string }> {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new HttpError(401, "Não autenticado");
  let key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  try {
    key = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? key;
  } catch {
    /* usa a chave legada */
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, key, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  // Valida o token do usuário no Supabase Auth (a função é publicada com verify_jwt = false)
  const { data, error } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) throw new HttpError(401, "Sessão inválida");
  return { supabase, userId: data.user.id };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Chamada ao provedor de IA. A chave fica somente nos secrets do Supabase.
 * Prioridade:
 *   1. ANTHROPIC_API_KEY  → Claude (API da Anthropic). Modelo: AI_MODEL ou "claude-sonnet-5-5".
 *   2. AI_API_KEY (+ AI_API_URL, AI_MODEL) → qualquer API compatível com o chat da OpenAI.
 *   3. LOVABLE_API_KEY → AI Gateway do Lovable Cloud (padrão quando nada mais é configurado).
 */
export async function callAI(system: string, user: string): Promise<any> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim().replace(/^["']|["']$/g, "");
  let content = "";
  if (anthropicKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5",
        max_tokens: 8000,
        temperature: 0.4,
        system: system + "\nResponda apenas com o objeto JSON, sem texto antes ou depois e sem blocos de código.",
        messages: [{ role: "user", content: user }],
      }),
    });
    await assertOk(res);
    const data = await res.json();
    content = (data?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  } else {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const customKey = Deno.env.get("AI_API_KEY");
    const key = customKey ?? lovableKey;
    if (!key) throw new HttpError(500, "IA não configurada: defina ANTHROPIC_API_KEY, AI_API_KEY ou LOVABLE_API_KEY nos secrets do Supabase.");
    const url = Deno.env.get("AI_API_URL") ?? (customKey ? "https://api.openai.com/v1/chat/completions" : "https://ai.gateway.lovable.dev/v1/chat/completions");
    const model = Deno.env.get("AI_MODEL") ?? (customKey ? "gpt-4o-mini" : "google/gemini-2.5-flash");
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    await assertOk(res);
    const data = await res.json();
    content = data?.choices?.[0]?.message?.content ?? "";
  }
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    return JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
  } catch {
    throw new HttpError(502, "A IA retornou uma resposta em formato inesperado. Tente novamente.");
  }
}

async function assertOk(res: Response) {
  if (res.ok) return;
  // Mensagem do provedor (nunca contém a chave) para facilitar o diagnóstico
  let detail = "";
  try {
    const body = await res.json();
    detail = String(body?.error?.message ?? body?.message ?? "").slice(0, 200);
  } catch {
    /* sem corpo JSON */
  }
  console.error("AI error", res.status, detail);
  if (res.status === 429) throw new HttpError(429, "Limite de uso da IA atingido. Tente novamente em instantes.");
  if (res.status === 402 || /credit balance/i.test(detail))
    throw new HttpError(402, "Sem créditos na conta da Anthropic. Adicione créditos em console.anthropic.com → Billing.");
  if (res.status === 401) throw new HttpError(502, `Chave da IA inválida (${detail || "não autorizada"}). Cadastre de novo o secret ANTHROPIC_API_KEY, sem espaços ou aspas.`);
  if (res.status === 403) throw new HttpError(502, `A chave da IA não tem permissão (${detail || "acesso negado"}).`);
  if (res.status === 404 && /model/i.test(detail)) throw new HttpError(502, `Modelo de IA indisponível para esta chave (${detail}).`);
  throw new HttpError(502, `Falha no provedor de IA (${res.status}${detail ? `: ${detail}` : ""}).`);
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      return await fn(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(e);
      return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, status);
    }
  };
}

export const num = (v: unknown, d = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : d;
};

export function ageFrom(birth?: string | null) {
  if (!birth) return null;
  const b = new Date(birth);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

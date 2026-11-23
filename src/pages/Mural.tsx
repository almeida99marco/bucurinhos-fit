import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Camera, Dumbbell, Heart, ImagePlus, MessageCircle, RefreshCw, Salad, Send, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
import { backend, isClaude, isLocal } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import { cn, compressImage } from "@/lib/utils";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, PageLoader, Spinner, Textarea } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";
import { Avatar } from "@/components/Avatar";

type Kind = "prato" | "treino" | "outro";
type Post = {
  id: string; user_id: string; kind: Kind; caption: string | null; photo_path: string; created_at: string;
  author_name: string | null; author_avatar: string | null; like_count: number; liked: boolean; comment_count: number; likers: string[];
};
type Comment = { id: string; user_id: string; body: string; created_at: string; author_name: string | null; author_avatar: string | null };
type Link = { id: string; full_name: string | null; email: string | null; direction: "incoming" | "outgoing"; scopes: string[] };

const KINDS: { value: Kind; label: string; icon: typeof Salad }[] = [
  { value: "prato", label: "Prato", icon: Salad },
  { value: "treino", label: "Treino", icon: Dumbbell },
  { value: "outro", label: "Outro", icon: Sparkles },
];
const PAGE = 15;
const ago = (iso: string) => formatDistanceToNowStrict(parseISO(iso), { locale: ptBR, addSuffix: true });
const firstName = (n?: string | null) => (n || "Alguém").split(" ")[0];

/** URLs assinadas das fotos, guardadas por 50 min (expiram em 1 h). */
const photoCache = new Map<string, { url: string; at: number }>();
async function photoUrl(path: string) {
  const c = photoCache.get(path);
  if (c && Date.now() - c.at < 50 * 60e3) return c.url;
  const url = await backend.fileUrl("wall-photos", path);
  photoCache.set(path, { url, at: Date.now() });
  return url;
}

export default function Mural() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState<Kind | "todos">("todos");
  const [links, setLinks] = useState<Link[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useFeedback();

  const loadLinks = useCallback(async () => {
    const rows = (await backend.rpc<Link[]>("shared_profiles", {})) ?? [];
    setLinks(rows.filter((r) => r.scopes?.includes("mural")));
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = (await backend.rpc<Post[]>("wall_feed", { p_limit: PAGE })) ?? [];
      setPosts(rows);
      setMore(rows.length === PAGE);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível carregar o mural.", "error");
      setPosts((p) => p ?? []);
    }
  }, [toast]);

  useEffect(() => {
    if (isLocal || isClaude) return setPosts([]);
    load();
    loadLinks().catch(() => undefined);
    // Atualiza quando o app volta para a frente (ex.: depois de ver uma notificação)
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load, loadLinks]);

  const loadMore = async () => {
    if (!posts?.length) return;
    const rows = (await backend.rpc<Post[]>("wall_feed", { p_limit: PAGE, p_before: posts[posts.length - 1].created_at })) ?? [];
    setPosts([...posts, ...rows]);
    setMore(rows.length === PAGE);
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadLinks().catch(() => undefined)]);
    setRefreshing(false);
  };

  const patch = (id: string, p: Partial<Post>) => setPosts((all) => all?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null);

  if (isLocal || isClaude)
    return (
      <div className="space-y-4">
        <PageHeader title="Mural" subtitle="Pratos e treinos do casal" />
        <Empty icon={<Users className="h-8 w-8" />} title="O mural funciona na versão online do app" text="Abra o Bucurinho's Fit pelo link do GitHub Pages para postar e ver o mural." />
      </div>
    );

  const seesMe = links.filter((l) => l.direction === "outgoing");
  const iSee = links.filter((l) => l.direction === "incoming");
  const shown = posts?.filter((p) => filter === "todos" || p.kind === filter) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mural"
        subtitle="Pratos da dieta e fotos de treino, com curtidas e comentários."
        action={
          <Button onClick={() => setNewOpen(true)}>
            <ImagePlus className="h-4 w-4" /> Postar
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {([{ value: "todos", label: "Todos" }, ...KINDS] as { value: Kind | "todos"; label: string }[]).map((k) => (
            <button
              key={k.value}
              onClick={() => setFilter(k.value)}
              className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition", filter === k.value ? "border-brand bg-brand text-onbrand" : "border-line bg-surface text-muted")}
            >
              {k.label}
            </button>
          ))}
        </div>
        <Button size="icon" variant="ghost" onClick={() => setPeopleOpen(true)} aria-label="Quem vê o mural">
          <Users className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={refresh} aria-label="Atualizar">
          <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {seesMe.length === 0 && posts !== null && (
        <Card className="flex items-start gap-3 border-brand/30 bg-brand/5">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Convide sua dupla para o mural</p>
            <p className="text-sm text-muted">Por enquanto só você vê seus posts. Libere para a outra pessoa pelo e-mail da conta dela, e peça que ela faça o mesmo com o seu.</p>
            <Button size="sm" className="mt-3" onClick={() => setPeopleOpen(true)}>
              Convidar
            </Button>
          </div>
        </Card>
      )}

      {posts === null ? (
        <PageLoader />
      ) : shown.length === 0 ? (
        <Empty
          icon={<Camera className="h-8 w-8" />}
          title={filter === "todos" ? "Nenhum post ainda" : "Nada nesta categoria"}
          text="Poste a foto do seu prato ou do treino de hoje."
          action={<Button onClick={() => setNewOpen(true)}><ImagePlus className="h-4 w-4" /> Fazer o primeiro post</Button>}
        />
      ) : (
        <div className="mx-auto max-w-xl space-y-4">
          {shown.map((p) => (
            <PostCard key={p.id} post={p} me={user!.id} onPatch={(x) => patch(p.id, x)} onDeleted={() => setPosts((all) => all?.filter((x) => x.id !== p.id) ?? null)} />
          ))}
          {more && filter === "todos" && (
            <Button variant="secondary" className="w-full" onClick={loadMore}>
              Carregar mais
            </Button>
          )}
        </div>
      )}

      <NewPost open={newOpen} onClose={() => setNewOpen(false)} onPosted={load} />
      <People open={peopleOpen} onClose={() => setPeopleOpen(false)} seesMe={seesMe} iSee={iSee} onChange={() => { loadLinks(); load(); }} />
    </div>
  );
}

function PostCard({ post, me, onPatch, onDeleted }: { post: Post; me: string; onPatch: (p: Partial<Post>) => void; onDeleted: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [pop, setPop] = useState(false);
  const { confirm, toast } = useFeedback();
  const mine = post.user_id === me;
  const kind = KINDS.find((k) => k.value === post.kind) ?? KINDS[2];
  const lastTap = useRef(0);

  useEffect(() => {
    photoUrl(post.photo_path).then(setUrl).catch(() => setUrl(""));
  }, [post.photo_path]);

  const toggleLike = async (force?: boolean) => {
    const liked = force ?? !post.liked;
    if (liked === post.liked) return;
    const me1 = "Você";
    onPatch({ liked, like_count: post.like_count + (liked ? 1 : -1), likers: liked ? [...post.likers, me1] : post.likers.filter((n) => n !== me1) });
    if (liked) {
      setPop(true);
      setTimeout(() => setPop(false), 600);
    }
    try {
      if (liked) await backend.insert("wall_likes", { post_id: post.id });
      else await backend.removeWhere("wall_likes", { post_id: post.id });
    } catch (e) {
      onPatch({ liked: post.liked, like_count: post.like_count, likers: post.likers });
      toast(e instanceof Error ? e.message : "Não foi possível curtir.", "error");
    }
  };

  // Toque duplo na foto curte (como no Instagram)
  const onPhotoTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) toggleLike(true);
    lastTap.current = now;
  };

  const remove = async () => {
    if (!(await confirm({ title: "Apagar este post?", text: "A foto, as curtidas e os comentários serão apagados.", confirmLabel: "Apagar", danger: true }))) return;
    try {
      await backend.remove("wall_posts", post.id);
      await backend.removeFile("wall-photos", post.photo_path).catch(() => undefined);
      onDeleted();
      toast("Post apagado.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível apagar.", "error");
    }
  };

  const likersText = post.likers.join(", ");

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 p-3">
        <Avatar profile={{ full_name: post.author_name ?? "", avatar_url: post.author_avatar }} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{mine ? "Você" : firstName(post.author_name)}</p>
          <p className="text-xs text-muted">{ago(post.created_at)}</p>
        </div>
        <Badge tone="brand">
          <kind.icon className="h-3 w-3" /> {kind.label}
        </Badge>
        {mine && (
          <Button size="icon" variant="ghost" onClick={remove} aria-label="Apagar post">
            <Trash2 className="h-4 w-4 text-muted" />
          </Button>
        )}
      </div>

      <div className="relative bg-surface2" onClick={onPhotoTap}>
        {url ? (
          <img src={url} alt={post.caption || kind.label} className="max-h-[75vh] w-full select-none object-cover" draggable={false} />
        ) : (
          <div className="flex aspect-square items-center justify-center">{url === "" ? <p className="text-sm text-muted">Foto indisponível</p> : <Spinner />}</div>
        )}
        {pop && <Heart className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow-lg animate-in" />}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center gap-1">
          <button onClick={() => toggleLike()} className="flex items-center gap-1.5 rounded-full px-2 py-1.5 active:scale-95" aria-label={post.liked ? "Descurtir" : "Curtir"}>
            <Heart className={cn("h-6 w-6 transition", post.liked ? "fill-red-500 text-red-500" : "text-ink")} />
            <span className="text-sm font-semibold">{post.like_count}</span>
          </button>
          <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1.5 rounded-full px-2 py-1.5 active:scale-95" aria-label="Comentários">
            <MessageCircle className="h-6 w-6" />
            <span className="text-sm font-semibold">{post.comment_count}</span>
          </button>
        </div>
        {post.like_count > 0 && <p className="text-xs text-muted">Curtido por {likersText}</p>}
        {post.caption && (
          <p className="whitespace-pre-wrap break-words text-sm">
            <span className="font-semibold">{mine ? "Você" : firstName(post.author_name)}</span> {post.caption}
          </p>
        )}
        {!showComments && post.comment_count > 0 && (
          <button className="text-sm text-muted" onClick={() => setShowComments(true)}>
            Ver {post.comment_count === 1 ? "1 comentário" : `os ${post.comment_count} comentários`}
          </button>
        )}
        {showComments && <Comments post={post} me={me} onCount={(n) => onPatch({ comment_count: n })} />}
      </div>
    </article>
  );
}

function Comments({ post, me, onCount }: { post: Post; me: string; onCount: (n: number) => void }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const rows = (await backend.rpc<Comment[]>("wall_comments_for", { p_post: post.id })) ?? [];
    setList(rows);
    onCount(rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);
  useEffect(() => {
    load().catch(() => setList([]));
  }, [load]);

  const send = () =>
    run("send", async () => {
      const body = text.trim();
      if (!body) return;
      if (body.length > 500) throw new Error("Comentário muito longo (máx. 500 caracteres).");
      await backend.insert("wall_comments", { post_id: post.id, body });
      setText("");
      await load();
    });

  const del = (c: Comment) =>
    run("del" + c.id, async () => {
      await backend.remove("wall_comments", c.id);
      await load();
    });

  return (
    <div className="space-y-2 border-t border-line pt-2">
      {list === null ? (
        <Spinner className="h-4 w-4" />
      ) : (
        list.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <Avatar profile={{ full_name: c.author_name ?? "", avatar_url: c.author_avatar }} size={28} />
            <div className="min-w-0 flex-1 rounded-2xl bg-surface2 px-3 py-2">
              <p className="text-xs font-semibold">
                {c.user_id === me ? "Você" : firstName(c.author_name)} <span className="font-normal text-muted">· {ago(c.created_at)}</span>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
            {(c.user_id === me || post.user_id === me) && (
              <button onClick={() => del(c)} className="p-1.5 text-muted" aria-label="Apagar comentário" disabled={busy === "del" + c.id}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva um comentário…" maxLength={500} enterKeyHint="send" />
        <Button size="icon" type="submit" loading={busy === "send"} disabled={!text.trim()} aria-label="Enviar comentário">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function NewPost({ open, onClose, onPosted }: { open: boolean; onClose: () => void; onPosted: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("prato");
  const [caption, setCaption] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const close = () => {
    setFile(null);
    setCaption("");
    onClose();
  };

  const publish = () =>
    run("post", async () => {
      if (!file) throw new Error("Escolha uma foto.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Imagem muito grande (máx. 20 MB).");
      const blob = await compressImage(file, 1600);
      const path = await backend.upload("wall-photos", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`, blob);
      try {
        await backend.insert("wall_posts", { kind, caption: caption.trim() || null, photo_path: path });
      } catch (e) {
        await backend.removeFile("wall-photos", path).catch(() => undefined);
        throw e;
      }
      close();
      onPosted();
    }, "Post publicado no mural!");

  return (
    <Modal open={open} onClose={close} title="Novo post">
      <div className="space-y-4">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {preview ? (
          <div className="relative overflow-hidden rounded-2xl">
            <img src={preview} alt="" className="max-h-80 w-full object-cover" />
            <Button size="sm" variant="secondary" className="absolute bottom-2 right-2" onClick={() => inputRef.current?.click()}>
              Trocar foto
            </Button>
          </div>
        ) : (
          <button onClick={() => inputRef.current?.click()} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface2 text-muted">
            <Camera className="h-8 w-8 text-brand" />
            <span className="font-medium">Tirar foto ou escolher da galeria</span>
          </button>
        )}
        <Field label="O que é?">
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                className={cn("flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium", kind === k.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted")}
              >
                <k.icon className="h-4 w-4" /> {k.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Legenda (opcional)">
          <Textarea rows={3} maxLength={1000} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={kind === "prato" ? "Ex.: Almoço pós-treino: frango, arroz e salada" : "Ex.: Treino de pernas concluído!"} />
        </Field>
        <Button className="w-full" onClick={publish} loading={busy === "post"} disabled={!file}>
          Publicar
        </Button>
      </div>
    </Modal>
  );
}

function People({ open, onClose, seesMe, iSee, onChange }: { open: boolean; onClose: () => void; seesMe: Link[]; iSee: Link[]; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  const invite = () =>
    run("invite", async () => {
      if (!email.includes("@")) throw new Error("Digite um e-mail válido.");
      await backend.rpc("mural_invite", { p_email: email.trim() });
      setEmail("");
      onChange();
    }, "Pronto! Essa pessoa já pode ver, curtir e comentar seus posts.");
  const revoke = async (l: Link) => {
    if (!(await confirm({ title: "Remover do mural?", text: `${l.full_name || l.email} deixará de ver seus posts.`, confirmLabel: "Remover", danger: true }))) return;
    run("rev" + l.id, async () => {
      await backend.rpc("mural_revoke", { p_viewer: l.id });
      onChange();
    }, "Acesso removido.");
  };
  return (
    <Modal open={open} onClose={onClose} title="Quem vê o mural">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm text-muted">Libere seus posts para alguém pelo e-mail da conta dela no app. Para você ver os posts dela, ela precisa fazer o mesmo com o seu e-mail.</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              invite();
            }}
          >
            <Input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            <Button type="submit" loading={busy === "invite"}>
              Liberar
            </Button>
          </form>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Veem os seus posts</p>
          {seesMe.length === 0 ? (
            <p className="text-sm text-muted">Ninguém ainda.</p>
          ) : (
            seesMe.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-1.5">
                <Avatar profile={{ full_name: l.full_name ?? "", avatar_url: null }} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.full_name || "Sem nome"}</p>
                  <p className="truncate text-xs text-muted">{l.email}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke(l)} loading={busy === "rev" + l.id}>
                  Remover
                </Button>
              </div>
            ))
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Você vê os posts de</p>
          {iSee.length === 0 ? (
            <p className="text-sm text-muted">Ninguém liberou o mural para você ainda.</p>
          ) : (
            iSee.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-1.5">
                <Avatar profile={{ full_name: l.full_name ?? "", avatar_url: null }} size={32} />
                <p className="truncate text-sm font-medium">{l.full_name || l.email}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

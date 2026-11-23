import { useEffect, useState } from "react";
import { backend } from "@/lib/backend";
import type { Profile } from "@/lib/types";

const cache = new Map<string, string>();

export function Avatar({ profile, size = 40 }: { profile: Pick<Profile, "full_name" | "avatar_url">; size?: number }) {
  const [url, setUrl] = useState<string | null>(profile.avatar_url ? cache.get(profile.avatar_url) ?? null : null);
  useEffect(() => {
    const p = profile.avatar_url;
    if (!p) return setUrl(null);
    if (cache.has(p)) return setUrl(cache.get(p)!);
    backend
      .fileUrl("avatars", p)
      .then((u) => {
        cache.set(p, u);
        setUrl(u);
      })
      .catch(() => setUrl(null));
  }, [profile.avatar_url]);
  const initials = (profile.full_name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-full object-cover ring-2 ring-brand/30" style={{ width: size, height: size }} />
  ) : (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials || "?"}
    </div>
  );
}

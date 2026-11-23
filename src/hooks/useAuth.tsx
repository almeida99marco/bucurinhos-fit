import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { AuthUser, backend } from "@/lib/backend";
import type { Profile } from "@/lib/types";
import { applyAccent } from "@/lib/theme";

type Ctx = {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  recovery: boolean;
  clearRecovery: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<Profile>;
};

const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  const loadProfile = useCallback(async (u: AuthUser | null) => {
    if (!u) return setProfile(null);
    // O perfil é criado por trigger no cadastro; tentamos algumas vezes caso ainda não exista.
    for (let i = 0; i < 4; i++) {
      const rows = await backend.list<Profile>("profiles", { eq: { id: u.id } });
      if (rows[0]) {
        applyAccent(rows[0].accent_color);
        return setProfile(rows[0]);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    setProfile(null);
  }, []);

  useEffect(() => {
    let alive = true;
    backend.auth
      .getUser()
      .then(async (u) => {
        if (!alive) return;
        setUser(u);
        await loadProfile(u).catch(() => setProfile(null));
      })
      .finally(() => alive && setLoading(false));
    const off = backend.auth.onChange(async (u, event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "TOKEN_REFRESHED") return;
      setUser(u);
      await loadProfile(u).catch(() => setProfile(null));
    });
    return () => {
      alive = false;
      off();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(user), [user, loadProfile]);
  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) throw new Error("Sessão expirada.");
      const p = await backend.update<Profile>("profiles", user.id, patch);
      setProfile(p);
      if (patch.accent_color) applyAccent(p.accent_color);
      return p;
    },
    [user],
  );

  return <AuthCtx.Provider value={{ user, profile, loading, recovery, clearRecovery: () => setRecovery(false), refreshProfile, updateProfile }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

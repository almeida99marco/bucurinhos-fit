import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bot, CalendarDays, Dumbbell, Footprints, Home, LineChart, Salad, User, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isLocal } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { useReminders } from "@/hooks/useReminders";
import { Avatar } from "./Avatar";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-onbrand">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 13h4l3-8 4 14 3-6h4" />
        </svg>
      </span>
      <span>
        Bucurinho's <span className="text-brand">Fit</span>
      </span>
    </div>
  );
}

export default function Layout() {
  const { profile } = useAuth();
  const loc = useLocation();
  useReminders();

  const main = [
    { to: "/", label: "Início", icon: Home },
    { to: "/nutricao", label: "Nutrição", icon: Salad },
    { to: "/treinos", label: "Treinos", icon: Dumbbell },
    ...(profile?.running_enabled ? [{ to: "/corrida", label: "Corrida", icon: Footprints }] : []),
    { to: "/evolucao", label: "Evolução", icon: LineChart },
    { to: "/perfil", label: "Perfil", icon: User },
  ];
  const extra = [
    { to: "/calendario", label: "Calendário", icon: CalendarDays },
    { to: "/assistente", label: "Assistente IA", icon: Bot },
    { to: "/compartilhados", label: "Compartilhados", icon: Users },
  ];
  const hideNav = loc.pathname.startsWith("/treinos/executar");

  return (
    <div className="min-h-screen bg-bg text-ink">
      {isLocal && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[11px] text-amber-700 lg:pl-64">
          Prévia local: os dados ficam salvos neste navegador. IA, e-mails e sincronização funcionam com o Supabase conectado.
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface p-4 backdrop-blur lg:flex">
        <Logo className="mb-8 px-2 pt-2 text-lg" />
        <nav className="flex flex-1 flex-col gap-1">
          {main.map((i) => (
            <SideLink key={i.to} {...i} />
          ))}
          <div className="my-3 border-t border-line" />
          {extra.map((i) => (
            <SideLink key={i.to} {...i} />
          ))}
        </nav>
        {profile && (
          <NavLink to="/perfil" className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface2">
            <Avatar profile={profile} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile.full_name || "Seu perfil"}</p>
              <p className="truncate text-xs text-muted">{profile.email}</p>
            </div>
          </NavLink>
        )}
      </aside>

      {/* Header mobile */}
      {!hideNav && (
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            {extra.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                aria-label={i.label}
                className={({ isActive }) => cn("rounded-xl p-2", isActive ? "bg-brand-soft text-brand" : "text-muted hover:text-ink")}
              >
                <i.icon className="h-5 w-5" />
              </NavLink>
            ))}
          </div>
        </header>
      )}

      <main className={cn("mx-auto max-w-6xl px-4 pt-5 sm:px-6 lg:ml-60 lg:max-w-none lg:px-10 lg:pt-8", hideNav ? "pb-10" : "pb-28 lg:pb-12")}>
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav mobile */}
      {!hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg justify-around">
            {main.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === "/"}
                className={({ isActive }) => cn("flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium", isActive ? "text-brand" : "text-muted")}
              >
                <i.icon className="h-5 w-5" />
                {i.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function SideLink({ to, label, icon: Icon }: { to: string; label: string; icon: any }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-brand text-onbrand" : "text-muted hover:bg-surface2 hover:text-ink")
      }
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </NavLink>
  );
}

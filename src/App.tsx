import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { FeedbackProvider } from "@/components/feedback";
import { PageLoader } from "@/components/ui";
import { isClaude, isLocal } from "@/lib/backend";
import Layout from "@/components/Layout";
import { ForgotPassword, Login, ResetPassword, Signup } from "@/pages/Auth";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";

const Nutrition = lazy(() => import("@/pages/Nutrition"));
const Workouts = lazy(() => import("@/pages/Workouts"));
const WorkoutRun = lazy(() => import("@/pages/WorkoutRun"));
const Running = lazy(() => import("@/pages/Running"));
const Progress = lazy(() => import("@/pages/Progress"));
const ProfilePage = lazy(() => import("@/pages/Profile"));
const CalendarPage = lazy(() => import("@/pages/Calendar"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const Shared = lazy(() => import("@/pages/Shared"));

function Protected() {
  const { user, profile, loading, recovery } = useAuth();
  if (loading) return <div className="min-h-screen bg-bg"><PageLoader /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (recovery) return <Navigate to="/redefinir-senha" replace />;
  if (!profile) return <div className="min-h-screen bg-bg"><PageLoader /></div>;
  if (!profile.onboarded) return <Onboarding />;
  return <Layout />;
}

function PublicOnly({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-bg"><PageLoader /></div>;
  return user ? <Navigate to="/" replace /> : children;
}

function RunningGuard({ children }: { children: JSX.Element }) {
  const { profile } = useAuth();
  return profile?.running_enabled ? children : <Navigate to="/" replace />;
}

export default function App() {
  const Router = isClaude ? MemoryRouter : isLocal ? HashRouter : BrowserRouter;
  return (
    <FeedbackProvider>
      <AuthProvider>
        <Router basename={isClaude || isLocal ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
              <Route path="/cadastro" element={<PublicOnly><Signup /></PublicOnly>} />
              <Route path="/recuperar-senha" element={<ForgotPassword />} />
              <Route path="/redefinir-senha" element={<ResetPassword />} />
              <Route element={<Protected />}>
                <Route index element={<Dashboard />} />
                <Route path="nutricao" element={<Nutrition />} />
                <Route path="treinos" element={<Workouts />} />
                <Route path="treinos/executar/:dayId" element={<WorkoutRun />} />
                <Route path="corrida" element={<RunningGuard><Running /></RunningGuard>} />
                <Route path="evolucao" element={<Progress />} />
                <Route path="perfil" element={<ProfilePage />} />
                <Route path="calendario" element={<CalendarPage />} />
                <Route path="assistente" element={<Assistant />} />
                <Route path="compartilhados" element={<Shared />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </FeedbackProvider>
  );
}

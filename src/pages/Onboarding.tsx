import { useAuth } from "@/hooks/useAuth";
import { backend } from "@/lib/backend";
import { Card } from "@/components/ui";
import { Logo } from "@/components/Layout";
import { ProfileForm } from "@/components/ProfileForm";
import { today } from "@/lib/utils";
import { logActivity } from "@/hooks/useData";

export default function Onboarding() {
  const { profile, updateProfile } = useAuth();
  if (!profile) return null;
  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Logo className="mb-8 text-xl" />
        <h1 className="text-2xl font-bold">Vamos configurar seu perfil</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Esses dados personalizam suas metas, sua dieta e seu painel. Você pode alterá-los depois no Perfil.</p>
        <Card>
          <ProfileForm
            initial={profile}
            submitLabel="Começar"
            onSubmit={async (v) => {
              await updateProfile({ ...v, onboarded: true, running_enabled: profile.running_enabled || v.sex === "masculino" });
              if (v.weight_kg) {
                await backend.insert("body_measurements", { date: today(), weight_kg: v.weight_kg });
                await logActivity("medidas", `Peso inicial: ${v.weight_kg} kg`);
              }
              if (v.goal_weight_kg) {
                await backend.insert("user_goals", { type: "peso", title: `Chegar a ${v.goal_weight_kg} kg`, target_value: v.goal_weight_kg, unit: "kg", active: true });
              }
            }}
          />
        </Card>
      </div>
    </div>
  );
}

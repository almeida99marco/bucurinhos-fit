export type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  birth_date: string | null;
  sex: "masculino" | "feminino" | "outro" | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
  activity_level: string | null;
  fitness_goals: string | null;
  running_enabled: boolean;
  water_goal_ml: number;
  onboarded: boolean;
  accent_color: "verde" | "vermelho";
  share_scopes?: string[];
};

export type NutritionProfile = {
  id: string;
  user_id: string;
  goal: string | null;
  activity_level: string | null;
  target_weight_kg: number | null;
  restrictions: string | null;
  allergies: string | null;
  health_conditions: string | null;
  preferences: string | null;
  dislikes: string | null;
  meals_per_day: number | null;
  budget: string | null;
  routine: string | null;
  secondary_goals: string[];
  custom_goal: string | null;
  strength_days_per_week: number | null;
  running_km_per_week: number | null;
  training_time: string | null;
  supplements: string | null;
};

export type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };

export type MealPlan = {
  id: string;
  title: string;
  status: "active" | "archived";
  target_calories: number | null;
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  notes: string | null;
  source: string;
  created_at: string;
};

export type Meal = Macros & {
  id: string;
  plan_id: string;
  meal_type: string;
  name: string;
  time: string | null;
  position: number;
};

export type FoodItem = Macros & {
  id: string;
  meal_id: string;
  name: string;
  quantity_g: number;
  household_measure: string | null;
  alternatives: { name: string; quantity_g: number }[];
  position: number;
};

export type MealLog = Macros & { id: string; date: string; meal_id: string | null; name: string };

export type WorkoutPlan = { id: string; name: string; goal: string | null; notes: string | null; active: boolean; source: string; created_at: string };
export type WorkoutDay = { id: string; plan_id: string; label: string; name: string | null; weekdays: number[]; position: number };
export type Exercise = {
  id: string;
  workout_day_id: string;
  library_id: string | null;
  name: string;
  muscle_group: string | null;
  sets: number;
  reps: string;
  load_kg: number | null;
  rest_seconds: number;
  notes: string | null;
  position: number;
};
export type LibraryItem = { id: string; user_id: string | null; name: string; muscle_group: string; description: string | null; instructions: string | null; media_url: string | null };
export type WorkoutSession = { id: string; workout_day_id: string | null; title: string; started_at: string; finished_at: string | null; duration_seconds: number | null; notes: string | null };
export type WorkoutSet = { id: string; session_id: string; exercise_id: string | null; exercise_name: string; set_number: number; reps: number | null; load_kg: number | null; completed: boolean; created_at: string };

export type RunningSession = {
  id: string;
  date: string;
  status: "done" | "planned";
  type: string;
  distance_km: number;
  duration_seconds: number | null;
  pace_seconds_per_km: number | null;
  avg_heart_rate: number | null;
  calories: number | null;
  notes: string | null;
  source: string;
};
export type RunningGoal = { id: string; title: string; target_km: number; target_time_seconds: number | null; target_date: string | null; achieved_at: string | null; created_at: string };

export type BodyMeasurement = {
  id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  abdomen_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  hip_cm: number | null;
  notes: string | null;
};
export type ProgressPhoto = { id: string; date: string; storage_path: string; pose: string | null; notes: string | null };

export type WaterEntry = { id: string; date: string; amount_ml: number; created_at: string };
export type Activity = { id: string; date: string; kind: string; title: string; ref_id: string | null; details: any; created_at: string };
export type NotificationRule = { id: string; kind: string; title: string; time_of_day: string; weekdays: number[]; enabled: boolean; last_sent_at: string | null };
export type UserGoal = { id: string; type: string; title: string; target_value: number | null; unit: string | null; target_date: string | null; active: boolean; achieved_at: string | null };
export type AIInteraction = { id: string; kind: string; request: any; response: any; status: string; created_at: string };

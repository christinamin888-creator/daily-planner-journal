/// <reference types="vite/client" />

import { createClient } from "@supabase/supabase-js";
import type { AuthChangeEvent, Session, SupabaseClient, User } from "@supabase/supabase-js";

export type DailyPlannerUserDataRecord = {
  user_id: string;
  payload: unknown;
  updated_at?: string | null;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase 环境变量未配置");
  }

  return supabase;
}

function getAuthRedirectUrl(mode?: "recovery"): string {
  if (typeof window === "undefined") {
    return "https://www.planthenact.com";
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  if (mode === "recovery") {
    url.searchParams.set("auth", "recovery");
  }

  return url.toString();
}

export async function signUp(email: string, password: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.user;
}

export async function signIn(email: string, password: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.user;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectUrl("recovery"),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePassword(password: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient().auth.updateUser({
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.user;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  const {
    data: { subscription },
  } = getSupabaseClient().auth.onAuthStateChange(callback);

  return subscription;
}

export async function getDailyPlannerUserData(
  userId: string,
): Promise<DailyPlannerUserDataRecord | null> {
  const { data, error } = await getSupabaseClient()
    .from("daily_planner_user_data")
    .select("user_id,payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DailyPlannerUserDataRecord | null;
}

export async function upsertDailyPlannerUserData(params: {
  userId: string;
  payload: unknown;
}): Promise<DailyPlannerUserDataRecord | null> {
  const { data, error } = await getSupabaseClient()
    .from("daily_planner_user_data")
    .upsert(
      {
        user_id: params.userId,
        payload: params.payload,
      },
      { onConflict: "user_id" },
    )
    .select("user_id,payload")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DailyPlannerUserDataRecord | null;
}

/// <reference types="vite/client" />

type RpcPayload = Record<string, unknown>;

export type DailyPlannerSyncRecord = {
  payload: unknown;
  version?: number;
  updated_at?: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

async function callRpc<T>(functionName: string, payload: RpcPayload): Promise<T | null> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase 环境变量未配置");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String(data.message)
        : "Supabase 同步失败";
    throw new Error(message);
  }

  return data as T;
}

function firstRecord(data: unknown): DailyPlannerSyncRecord | null {
  if (!data) {
    return null;
  }

  const record = Array.isArray(data) ? data[0] : data;

  if (!record || typeof record !== "object") {
    return null;
  }

  if (!("payload" in record)) {
    return { payload: record };
  }

  return record as DailyPlannerSyncRecord;
}

export async function getDailyPlannerSync(
  syncCodeHash: string,
): Promise<DailyPlannerSyncRecord | null> {
  const data = await callRpc<unknown>("get_daily_planner_sync", {
    p_sync_code_hash: syncCodeHash,
  });

  return firstRecord(data);
}

export async function upsertDailyPlannerSync(params: {
  syncCodeHash: string;
  payload: unknown;
  version: number;
  clientId: string;
}): Promise<DailyPlannerSyncRecord | null> {
  const data = await callRpc<unknown>("upsert_daily_planner_sync", {
    p_sync_code_hash: params.syncCodeHash,
    p_payload: params.payload,
    p_last_client_id: params.clientId,
  });

  return firstRecord(data);
}

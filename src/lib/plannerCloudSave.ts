import type { SupabaseClient } from "@supabase/supabase-js";

export type PlannerCloudSave = {
  userId: string;
  expectedPayload: unknown;
  payload: unknown;
};

export async function savePlannerSnapshot(
  client: Pick<SupabaseClient, "rpc">,
  params: PlannerCloudSave,
): Promise<void> {
  if (!params.userId || params.expectedPayload === undefined) {
    throw new Error("保存前需要先读取当前账号的云端版本，本地记录仍然保留。");
  }

  // Send the original server snapshot, not the normalized or merged payload.
  const { data, error } = await client.rpc("sync_daily_planner_for_user", {
    expected_user_id: params.userId,
    expected_payload: params.expectedPayload,
    next_payload: params.payload,
  });

  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("网站安全同步接口尚未启用，本地记录仍然保留。");
    }
    throw new Error("云端保存未完成，本地记录仍然保留，请稍后重试。");
  }

  if (data?.accepted !== true) {
    throw new Error("其他设备刚刚修改了云端记录，本次未覆盖云端，请再次同步。本地记录仍然保留。");
  }
}

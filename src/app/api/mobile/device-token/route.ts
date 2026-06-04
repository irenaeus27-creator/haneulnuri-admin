import { NextRequest, NextResponse } from "next/server";
import {
  JsonRecord,
  buildId,
  mobileSupabase,
  nowIso,
  requireUserId,
  text,
  toCamelObject,
} from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as JsonRecord;
    const data = (body.data || body) as JsonRecord;

    const userId = requireUserId(data.userId || data.user_id);
    const fcmToken = text(data.fcmToken || data.fcm_token || data.token);
    if (!fcmToken) throw new Error("fcmToken이 필요합니다.");

    const now = nowIso();
    const supabase = mobileSupabase();

    const tokenRow = {
      token_id: text(data.tokenId || data.token_id) || buildId("DTK"),
      user_id: userId,
      user_name: text(data.userName || data.user_name),
      phone: text(data.phone),
      fcm_token: fcmToken,
      platform: text(data.platform),
      app_version: text(data.appVersion || data.app_version),
      active: true,
      created_at: now,
      updated_at: now,
      last_seen_at: now,
    };

    const { data: existing } = await supabase
      .from("device_tokens")
      .select("*")
      .eq("fcm_token", fcmToken)
      .maybeSingle();

    const query = existing
      ? supabase
          .from("device_tokens")
          .update({
            user_id: tokenRow.user_id,
            user_name: tokenRow.user_name,
            phone: tokenRow.phone,
            platform: tokenRow.platform,
            app_version: tokenRow.app_version,
            active: true,
            updated_at: now,
            last_seen_at: now,
          })
          .eq("fcm_token", fcmToken)
          .select("*")
          .single()
      : supabase
          .from("device_tokens")
          .insert(tokenRow)
          .select("*")
          .single();

    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);

    const deviceToken = toCamelObject(saved as JsonRecord);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-mobile-device-token",
      message: "기기 토큰을 저장했습니다.",
      deviceToken,
      data: deviceToken,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-mobile-device-token",
        message: error instanceof Error ? error.message : "기기 토큰 저장에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

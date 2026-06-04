import { NextRequest, NextResponse } from "next/server";
import { getUserBundleByUserId, requireUserId, text } from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const userId = requireUserId(searchParams.get("userId"));
    const bundle = await getUserBundleByUserId(userId);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-mobile-me",
      userId,
      ...bundle,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-mobile-me",
        message: error instanceof Error ? error.message : "내 정보 조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

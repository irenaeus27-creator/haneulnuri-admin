import { NextRequest, NextResponse } from "next/server";
import { getMobileAuthContext, text } from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const context = await getMobileAuthContext(request, searchParams.get("userId"));

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-mobile-me",
      authUserId: context.authUserId,
      userId: context.userId,
      user: context.user,
      student: context.student,
      rentalPilot: context.rentalPilot,
      data: {
        authUserId: context.authUserId,
        userId: context.userId,
        user: context.user,
        student: context.student,
        rentalPilot: context.rentalPilot,
      },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "내 정보 조회에 실패했습니다.";
    const status = text(message).includes("로그인") || text(message).includes("토큰") ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-mobile-me",
        message,
        elapsedMs: Date.now() - startedAt,
      },
      { status }
    );
  }
}

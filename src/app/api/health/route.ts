import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = process.env.NEXT_PUBLIC_API_URL;


function validateSystemToolToken(request: Request) {
  const expectedToken = process.env.SYSTEM_TOOL_TOKEN;
  const isProduction = process.env.NODE_ENV === "production";

  if (!expectedToken && !isProduction) {
    return null;
  }

  if (!expectedToken && isProduction) {
    return "SYSTEM_TOOL_TOKEN 환경변수가 설정되어 있지 않습니다.";
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") || "";
  const headerToken = request.headers.get("x-system-tool-token") || "";

  if (queryToken !== expectedToken && headerToken !== expectedToken) {
    return "시스템 점검 토큰이 올바르지 않습니다.";
  }

  return null;
}

async function callAppsScript(action: string) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("_ts", String(Date.now()));

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Apps Script 오류: ${response.status}`);
  }

  if (!text.trim()) {
    throw new Error("Apps Script 응답이 비어 있습니다.");
  }

  return JSON.parse(text);
}

export async function GET(request: Request) {
  const authError = validateSystemToolToken(request);
  if (authError) {
    return NextResponse.json(
      {
        ok: false,
        message: authError,
      },
      { status: 403 }
    );
  }

  try {
    const [health, sheetMeta] = await Promise.all([
      callAppsScript("getHealth"),
      callAppsScript("getSheetMeta"),
    ]);

    return NextResponse.json({
      ok: true,
      health,
      sheetMeta,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "상태 점검에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}

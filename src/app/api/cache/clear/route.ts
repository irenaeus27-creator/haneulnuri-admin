import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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

export async function GET() {
  try {
    const result = await callAppsScript("clearCache");

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "캐시 초기화에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}

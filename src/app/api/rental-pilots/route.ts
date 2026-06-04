import { NextRequest, NextResponse } from "next/server";
import { normalizeSettingsRows } from "@/lib/settingsOptions";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
type ApiObject = Record<string, unknown>;

function normalizeRows(data: unknown, key?: string): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];
  if (data && typeof data === "object") {
    const obj = data as ApiObject;
    if (key && Array.isArray(obj[key])) return obj[key] as ApiObject[];
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
  }
  return [];
}

async function fetchSheet(sheetName: string, optional = false) {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getSheet");
    url.searchParams.set("sheet", sheetName);
    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const rawText = await response.text();
    if (!response.ok) throw new Error(`Apps Script API 오류: ${response.status}`);
    if (!rawText.trim()) return [];
    const parsedData = JSON.parse(rawText) as unknown;
    if (parsedData && typeof parsedData === "object" && "success" in parsedData && (parsedData as ApiObject).success === false) {
      if (optional) return [];
      throw new Error(String((parsedData as ApiObject).message || `${sheetName} 시트를 불러오지 못했습니다.`));
    }
    return normalizeRows(parsedData, sheetName);
  } catch (error) {
    if (optional) return [];
    throw error;
  }
}

async function postToAppsScript(action: string, data: ApiObject) {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data }),
    cache: "no-store",
  });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`Apps Script API 오류: ${response.status}`);
  if (!rawText.trim()) throw new Error("Apps Script 응답이 비어 있습니다.");
  const parsedData = JSON.parse(rawText) as ApiObject;
  if (parsedData && parsedData.success === false) throw new Error(String(parsedData.message || "Apps Script 처리에 실패했습니다."));
  return parsedData;
}

export async function GET() {
  try {
    const [rentalPilots, users, rawSettings, aircraft] = await Promise.all([
      fetchSheet("rentalPilots"),
      fetchSheet("users", true),
      fetchSheet("settings", true),
      fetchSheet("aircraft", true),
    ]);
    const settings = normalizeSettingsRows(rawSettings);

    return NextResponse.json({ ok: true, rentalPilots, users, settings, aircraft });
  } catch (error) {
    console.error("[rental-pilots GET error]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "렌탈 기장 데이터를 불러오지 못했습니다.", rentalPilots: [], users: [], settings: [], aircraft: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = String(body.mode || "").trim();
    const data = (body.data || {}) as ApiObject;
    if (mode === "add") return NextResponse.json({ ok: true, result: await postToAppsScript("addRentalPilot", data) });
    if (mode === "update") return NextResponse.json({ ok: true, result: await postToAppsScript("updateRentalPilot", data) });
    return NextResponse.json({ ok: false, message: `지원하지 않는 mode입니다: ${mode}` }, { status: 400 });
  } catch (error) {
    console.error("[rental-pilots POST error]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "렌탈 기장 정보를 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}

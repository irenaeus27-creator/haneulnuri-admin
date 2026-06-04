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

async function fetchSheet(sheetName: string) {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  const url = new URL(API_URL);
  url.searchParams.set("action", "getSheet");
  url.searchParams.set("sheet", sheetName);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`Apps Script API 오류: ${response.status}`);
  if (!rawText.trim()) return [];
  let parsedData: unknown;
  try { parsedData = JSON.parse(rawText); } catch { return []; }
  if (parsedData && typeof parsedData === "object" && "success" in parsedData && (parsedData as ApiObject).success === false) return [];
  return normalizeRows(parsedData, sheetName);
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
    const [managedFiles, instructors, aircraft, documentAgreements, aircraftMaintenance, users, rawSettings] = await Promise.all([
      fetchSheet("managedFiles"),
      fetchSheet("instructors"),
      fetchSheet("aircraft"),
      fetchSheet("documentAgreements"),
      fetchSheet("aircraftMaintenance"),
      fetchSheet("users"),
      fetchSheet("settings"),
    ]);
    const settings = normalizeSettingsRows(rawSettings);

    return NextResponse.json({ ok: true, managedFiles, instructors, aircraft, documentAgreements, aircraftMaintenance, users, settings });
  } catch (error) {
    console.error("[file-assets GET error]", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "파일/사진 URL 데이터를 불러오지 못했습니다.", managedFiles: [], instructors: [], aircraft: [], documentAgreements: [], aircraftMaintenance: [], users: [], settings: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = String(body.mode || "").trim();
    const data = (body.data || {}) as ApiObject;
    if (mode === "add") return NextResponse.json({ ok: true, result: await postToAppsScript("addManagedFile", data) });
    if (mode === "update") return NextResponse.json({ ok: true, result: await postToAppsScript("updateManagedFile", data) });
    return NextResponse.json({ ok: false, message: `지원하지 않는 mode입니다: ${mode}` }, { status: 400 });
  } catch (error) {
    console.error("[file-assets POST error]", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "파일/사진 URL 정보를 저장하지 못했습니다." }, { status: 500 });
  }
}

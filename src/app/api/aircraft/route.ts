import { NextRequest, NextResponse } from "next/server";
import { normalizeSettingsRows } from "@/lib/settingsOptions";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

type ApiObject = Record<string, unknown>;

function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];

  if (data && typeof data === "object") {
    const obj = data as ApiObject;
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
    if (Array.isArray(obj.values)) return obj.values as ApiObject[];
  }

  return [];
}

async function readJsonResponse(response: Response, context: string) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    throw new Error(`${context} 응답이 비어 있습니다.`);
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(`${context} 응답을 JSON으로 변환하지 못했습니다.`);
  }
}

async function fetchSheet(sheetName: string, options?: { optional?: boolean }) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getSheet");
    url.searchParams.set("sheet", sheetName);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`${sheetName} 시트 Apps Script API 오류: ${response.status}`);
    }

    const parsedData = await readJsonResponse(response, `${sheetName} 시트`);

    if (
      parsedData &&
      typeof parsedData === "object" &&
      "success" in parsedData &&
      (parsedData as ApiObject).success === false
    ) {
      throw new Error(
        String((parsedData as ApiObject).message || "") ||
          `${sheetName} 시트를 불러오지 못했습니다.`
      );
    }

    return normalizeRows(parsedData);
  } catch (error) {
    if (options?.optional) {
      console.warn(`[aircraft GET optional sheet skipped: ${sheetName}]`, error instanceof Error ? error.message : error);
      return [];
    }

    throw error;
  }
}

async function postToAppsScript(action: string, data: ApiObject) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ action, data }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  const parsedData = await readJsonResponse(response, "Apps Script");

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || "") ||
        `Apps Script 처리에 실패했습니다. action=${action}`
    );
  }

  return parsedData;
}

export async function GET() {
  try {
    const [aircraft, rawSettings] = await Promise.all([
      fetchSheet("aircraft"),
      fetchSheet("settings", { optional: true }),
    ]);

    const settings = normalizeSettingsRows(rawSettings);

    return NextResponse.json({
      ok: true,
      aircraft,
      settings,
    });
  } catch (error) {
    console.error("[aircraft GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "항공기 데이터를 불러오지 못했습니다.",
        aircraft: [],
        settings: [],
      },
      { status: 500 }
    );
  }
}


function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeAircraftPayload(data: ApiObject) {
  const aircraftId = text(data.aircraftId || data.id);
  const registrationNo = text(data.registrationNo || data.registration || data.aircraftName);
  const aircraftName = text(data.aircraftName || data.name || registrationNo);

  return {
    ...data,
    sheetName: "aircraft",
    idHeader: "aircraftId",
    aircraftId,
    id: text(data.id || aircraftId),
    aircraftName,
    name: text(data.name || aircraftName),
    registrationNo,
    registration: text(data.registration || registrationNo),
    status: text(data.status || "운항 가능"),
    active: data.active ?? true,
  };
}

function fallbackActions(action: string) {
  if (action === "addAircraft") return ["addAircraft", "addRow"];
  if (action === "updateAircraft") return ["updateAircraft", "updateRow"];
  if (action === "deactivateAircraft") return ["deactivateAircraft", "updateAircraft", "updateRow"];
  return [action];
}

async function postAircraftWithFallback(action: string, data: ApiObject) {
  const payload = normalizeAircraftPayload(data);
  const errors: string[] = [];

  for (const candidateAction of fallbackActions(action)) {
    try {
      return await postToAppsScript(candidateAction, payload);
    } catch (error) {
      errors.push(`${candidateAction}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(" / "));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action || "").trim();
    const data = (body.data || {}) as ApiObject;

    if (!action) {
      return NextResponse.json(
        { ok: false, success: false, message: "action 값이 필요합니다." },
        { status: 400 }
      );
    }

    const allowedActions = new Set([
      "addAircraft",
      "updateAircraft",
      "deactivateAircraft",
    ]);

    if (!allowedActions.has(action)) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: `지원하지 않는 action입니다: ${action}`,
        },
        { status: 400 }
      );
    }

    const result = await postAircraftWithFallback(action, data);

    return NextResponse.json({
      ok: true,
      success: true,
      result,
    });
  } catch (error) {
    console.error("[aircraft POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "항공기 정보를 저장하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}

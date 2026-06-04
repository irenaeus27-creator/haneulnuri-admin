import { NextRequest, NextResponse } from "next/server";
import { normalizeSettingsRows } from "@/lib/settingsOptions";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

type ApiObject = Record<string, unknown>;

function normalizeRows(data: unknown, key?: string): ApiObject[] {
  if (Array.isArray(data)) {
    return data as ApiObject[];
  }

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (key && Array.isArray(obj[key])) {
      return obj[key] as ApiObject[];
    }

    if (Array.isArray(obj.data)) {
      return obj.data as ApiObject[];
    }

    if (Array.isArray(obj.rows)) {
      return obj.rows as ApiObject[];
    }
  }

  return [];
}

async function fetchSheet(sheetName: string) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getSheet");
  url.searchParams.set("sheet", sheetName);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  if (!rawText.trim()) {
    throw new Error(`${sheetName} 시트 응답이 비어 있습니다.`);
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawText);
  } catch {
    throw new Error(`${sheetName} 시트 응답을 JSON으로 변환하지 못했습니다.`);
  }

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

  return normalizeRows(parsedData, sheetName);
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
    body: JSON.stringify({
      action,
      data,
    }),
    cache: "no-store",
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  if (!rawText.trim()) {
    throw new Error("Apps Script 응답이 비어 있습니다.");
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawText);
  } catch {
    throw new Error("Apps Script 응답을 JSON으로 변환하지 못했습니다.");
  }

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || "") ||
        "Apps Script 처리에 실패했습니다."
    );
  }

  return parsedData;
}

export async function GET() {
  try {
    const [documentAgreements, rawSettings, users, aircraft] = await Promise.all([
      fetchSheet("documentAgreements"),
      fetchSheet("settings"),
      fetchSheet("users"),
      fetchSheet("aircraft"),
    ]);

    const settings = normalizeSettingsRows(rawSettings);

    return NextResponse.json({
      ok: true,
      documentAgreements,
      settings,
      users,
      aircraft,
    });
  } catch (error) {
    console.error("[document-agreements GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "문서/서약서 데이터를 불러오지 못했습니다.",
        documentAgreements: [],
        settings: [],
        users: [],
        aircraft: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const mode = String(body.mode || "").trim();
    const data = (body.data || {}) as ApiObject;

    if (!mode) {
      return NextResponse.json(
        {
          ok: false,
          message: "mode 값이 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (mode === "add") {
      const result = await postToAppsScript("addDocumentAgreement", data);

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    if (mode === "update") {
      const result = await postToAppsScript("updateDocumentAgreement", data);

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: `지원하지 않는 mode입니다: ${mode}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[document-agreements POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "문서/서약서 정보를 저장하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

type ApiObject = Record<string, unknown>;

function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) {
    return data as ApiObject[];
  }

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (Array.isArray(obj.data)) {
      return obj.data as ApiObject[];
    }

    if (Array.isArray(obj.rows)) {
      return obj.rows as ApiObject[];
    }
  }

  return [];
}

export async function GET(request: NextRequest) {
  try {
    if (!API_URL) {
      return NextResponse.json(
        {
          ok: false,
          message: "NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.",
          rows: [],
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sheetName = String(searchParams.get("sheet") || "").trim();

    if (!sheetName) {
      return NextResponse.json(
        {
          ok: false,
          message: "sheet 파라미터가 필요합니다.",
          rows: [],
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          ok: false,
          message: `Apps Script API 오류: ${response.status}`,
          rawText,
          rows: [],
        },
        { status: 500 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        {
          ok: false,
          message: "Apps Script 응답이 비어 있습니다.",
          rows: [],
        },
        { status: 500 }
      );
    }

    let parsedData: unknown;

    try {
      parsedData = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "Apps Script 응답을 JSON으로 변환하지 못했습니다.",
          rawText,
          rows: [],
        },
        { status: 500 }
      );
    }

    if (
      parsedData &&
      typeof parsedData === "object" &&
      "success" in parsedData &&
      (parsedData as ApiObject).success === false
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            String((parsedData as ApiObject).message || "") ||
            "Apps Script에서 실패 응답을 반환했습니다.",
          rows: [],
        },
        { status: 500 }
      );
    }

    const rows = normalizeRows(parsedData);

    return NextResponse.json({
      ok: true,
      sheet: sheetName,
      rows,
    });
  } catch (error) {
    console.error("[sheets GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "시트 데이터를 불러오지 못했습니다.",
        rows: [],
      },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";

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

    if (Array.isArray(obj.logs)) {
      return obj.logs as ApiObject[];
    }
  }

  return [];
}

export async function GET() {
  try {
    if (!API_URL) {
      return NextResponse.json(
        {
          ok: false,
          message: "NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.",
          logs: [],
        },
        { status: 500 }
      );
    }

    const url = new URL(API_URL);
    url.searchParams.set("action", "getSheet");
    url.searchParams.set("sheet", "logs");

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
          logs: [],
        },
        { status: 500 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        {
          ok: false,
          message: "Apps Script 응답이 비어 있습니다.",
          logs: [],
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
          logs: [],
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
          logs: [],
        },
        { status: 500 }
      );
    }

    const logs = normalizeRows(parsedData);

    return NextResponse.json({
      ok: true,
      logs,
    });
  } catch (error) {
    console.error("[logs GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "로그 목록을 불러오지 못했습니다.",
        logs: [],
      },
      { status: 500 }
    );
  }
}
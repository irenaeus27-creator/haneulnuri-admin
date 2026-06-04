import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

type ApiObject = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (Array.isArray(obj.trainingCharges)) return obj.trainingCharges as ApiObject[];
    if (Array.isArray(obj.students)) return obj.students as ApiObject[];
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

async function fetchSheet(sheetName: string, optional = false) {
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
      throw new Error(`Apps Script API 오류: ${response.status}`);
    }

    const parsedData = await readJsonResponse(response, `${sheetName} 시트`);

    if (
      parsedData &&
      typeof parsedData === "object" &&
      "success" in parsedData &&
      (parsedData as ApiObject).success === false
    ) {
      if (optional) return [];

      throw new Error(
        String((parsedData as ApiObject).message || "") ||
          `${sheetName} 시트를 불러오지 못했습니다.`
      );
    }

    return normalizeRows(parsedData);
  } catch (error) {
    if (optional) return [];

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
    body: JSON.stringify({
      action,
      data,
    }),
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
        "Apps Script 처리에 실패했습니다."
    );
  }

  return parsedData;
}

function nowKstText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  const second = String(kst.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function nowIso() {
  return nowKstText();
}

function buildChargeId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `TC-${y}${m}${d}-${h}${min}${s}`;
}

function numberValue(value: unknown) {
  const n = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function minutesFromHours(value: unknown) {
  return Math.round(numberValue(value) * 60);
}

function hoursFromMinutes(value: unknown) {
  return Math.round((numberValue(value) / 60) * 10) / 10;
}

function normalizePayload(data: ApiObject, mode: string) {
  const chargeHours = numberValue(data.chargeHours ?? data.hours ?? data.creditHours);
  const usedHours = numberValue(data.usedHours);
  const chargedMinutes = numberValue(data.chargedMinutes ?? data.chargeMinutes) || minutesFromHours(chargeHours);
  const usedMinutes = numberValue(data.usedMinutes) || minutesFromHours(usedHours);
  const amount = numberValue(data.amount);
  const paidAmount = numberValue(data.paidAmount);
  const remainingMinutes = Math.max(chargedMinutes - usedMinutes, 0);
  const remainingHours = hoursFromMinutes(remainingMinutes);
  const unpaidAmount = Math.max(amount - paidAmount, 0);

  return {
    ...data,
    sheetName: "trainingCharges",
    idHeader: "chargeId",
    chargeId: text(data.chargeId) || (mode === "add" ? buildChargeId() : ""),
    chargeDate: text(data.chargeDate || data.date),
    chargeType: text(data.chargeType) || `${chargeHours || 20}시간 교육시간 충전`,
    chargedMinutes,
    chargeMinutes: chargedMinutes,
    chargeHours: hoursFromMinutes(chargedMinutes),
    hours: hoursFromMinutes(chargedMinutes),
    creditHours: hoursFromMinutes(chargedMinutes),
    usedMinutes,
    usedTrainingMinutes: usedMinutes,
    usedHours: hoursFromMinutes(usedMinutes),
    remainingMinutes,
    remainingTrainingMinutes: remainingMinutes,
    remainingHours,
    amount,
    paidAmount,
    unpaidAmount,
    hourlyRate: chargedMinutes > 0 ? Math.round(amount / (chargedMinutes / 60)) : 0,
    updatedAt: nowIso(),
    createdAt: text(data.createdAt) || nowIso(),
  };
}

export async function GET() {
  try {
    const [trainingCharges, students] = await Promise.all([
      fetchSheet("trainingCharges", true),
      fetchSheet("students", true),
    ]);

    return NextResponse.json({
      ok: true,
      success: true,
      trainingCharges,
      students,
    });
  } catch (error) {
    console.error("[training-charges GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "교육비 데이터를 불러오지 못했습니다.",
        trainingCharges: [],
        students: [],
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
          success: false,
          message: "mode 값이 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (mode === "add") {
      const payload = normalizePayload(data, mode);
      const result = await postToAppsScript("addTrainingCharge", payload);

      return NextResponse.json({
        ok: true,
        success: true,
        result,
        data: payload,
      });
    }

    if (mode === "update") {
      const payload = normalizePayload(data, mode);

      if (!text(payload.chargeId)) {
        return NextResponse.json(
          {
            ok: false,
            success: false,
            message: "수정할 chargeId가 필요합니다.",
          },
          { status: 400 }
        );
      }

      const result = await postToAppsScript("updateTrainingCharge", payload);

      return NextResponse.json({
        ok: true,
        success: true,
        result,
        data: payload,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: `지원하지 않는 mode입니다: ${mode}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[training-charges POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "교육비 저장에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}

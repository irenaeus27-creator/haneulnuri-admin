import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { JsonRecord, buildId, mapRows, nowIso, text } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "experience_consents";
const PREFIX = "EC";
const SERVICE = "skynuri-experience-consents";

function nullableText(value: unknown) {
  const raw = text(value);
  return raw || null;
}

function nullableDate(value: unknown) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function yn(value: unknown) {
  return text(value).toUpperCase() === "O" || value === true;
}

function booleanOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (raw.toLowerCase() === "true" || raw === "Yes") return true;
  if (raw.toLowerCase() === "false" || raw === "No") return false;
  return null;
}

function normalizeForInsert(input: JsonRecord, request: NextRequest) {
  const consentId = text(input.consentId || input.consent_id) || buildId(PREFIX);
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";

  return {
    consent_id: consentId,
    passenger_name: text(input.passengerName || input.passenger_name),
    birth_date: nullableDate(input.birthDate || input.birth_date),
    address: text(input.address),
    phone: text(input.phone),
    action_cam: yn(input.actionCam || input.action_cam),
    simulator: yn(input.simulator),
    photo_print: yn(input.photoPrint || input.photo_print),
    marketing_consent: yn(input.marketingConsent || input.marketing_consent),
    reservation_source: text(input.reservationSource || input.reservation_source),
    flight_date: nullableDate(input.flightDate || input.flight_date),
    health_clear: booleanOrNull(input.healthClear || input.health_clear),
    emergency_contact_name: text(input.emergencyContactName || input.emergency_contact_name),
    emergency_contact_phone: text(input.emergencyContactPhone || input.emergency_contact_phone),
    blood_type: text(input.bloodType || input.blood_type),
    signature_name: text(input.signatureName || input.signature_name),
    agreement_version: text(input.agreementVersion || input.agreement_version, "experience-passenger-waiver-v2026-06-07"),
    agreement_text: text(input.agreementText || input.agreement_text),
    user_agent: request.headers.get("user-agent") || "",
    ip_address: ipAddress,
    status: text(input.status, "제출완료"),
    memo: text(input.memo),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

async function selectRows() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`체험 동의서 조회 실패: ${error.message}`);
  return mapRows(data as JsonRecord[]);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await selectRows();
    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      experienceConsents: rows,
      data: { experienceConsents: rows },
      counts: { experienceConsents: rows.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : "체험 동의서 데이터를 불러오지 못했습니다.",
        experienceConsents: [],
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const row = normalizeForInsert(body, request);

    if (!row.passenger_name) throw new Error("성명을 입력해주세요.");
    if (!row.birth_date) throw new Error("생년월일을 입력해주세요.");
    if (!row.phone) throw new Error("전화번호를 입력해주세요.");
    if (!row.flight_date) throw new Error("탑승일을 입력해주세요.");
    if (row.health_clear === null) throw new Error("건강상태 확인을 선택해주세요.");
    if (!row.signature_name) throw new Error("서명란에 성명을 입력해주세요.");

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from(TABLE).insert(row).select("*").single();
    if (error) throw new Error(`체험 동의서 저장 실패: ${error.message}`);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      message: "체험 동의서가 제출되었습니다.",
      consentId: row.consent_id,
      experienceConsent: data,
      data,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : "체험 동의서 저장에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, insertRow, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_COLUMNS = ["id", "key", "value", "memo", "created_at", "updated_at"];

function normalizeSetting(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const row: JsonRecord = {
    key: text(input.key),
    value: text(input.value),
    memo: text(input.memo),
    created_at: text(input.createdAt || input.created_at) || (isCreate ? now : undefined),
    updated_at: now,
  };

  const id = Number(input.id);
  if (Number.isFinite(id) && id > 0) row.id = id;

  return pickAllowed(row, SETTINGS_COLUMNS);
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action.startsWith("add") || action === "addRow") {
    const saved = await insertRow("settings", normalizeSetting(data, true));
    return { message: "설정을 등록했습니다.", setting: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalizeSetting(data, false);
    const id = text(data.id || row.id);
    const saved = await updateRow("settings", "id", id, row);
    return { message: "설정을 수정했습니다.", setting: saved, data: saved };
  }

  throw new Error(`지원하지 않는 설정 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const settings = await selectRows("settings", { orderColumn: "id", ascending: true });
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-settings", settings, data: { settings }, counts: { settings: settings.length }, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "설정 조회에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-settings", elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "설정 처리에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

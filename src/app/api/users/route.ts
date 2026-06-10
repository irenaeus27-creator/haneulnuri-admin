import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, buildId, insertRow, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const USER_COLUMNS = ["user_id", "auth_user_id", "name", "phone", "email", "role", "status", "member_type", "created_at", "requested_at", "approved_at", "rejected_at", "updated_at", "memo"];

function normalizeUser(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const userId = text(input.userId || input.user_id) || buildId("U");
  return pickAllowed({
    user_id: userId,
    auth_user_id: text(input.authUserId || input.auth_user_id),
    name: text(input.name || input.userName || input.user_name),
    phone: text(input.phone),
    email: text(input.email),
    role: text(input.role),
    status: text(input.status || (isCreate ? "승인대기" : "")),
    member_type: text(input.memberType || input.member_type),
    memo: text(input.memo),
    created_at: text(input.createdAt || input.created_at) || (isCreate ? now : undefined),
    requested_at: text(input.requestedAt || input.requested_at),
    approved_at: text(input.approvedAt || input.approved_at),
    rejected_at: text(input.rejectedAt || input.rejected_at),
    updated_at: now,
  }, USER_COLUMNS);
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action === "addUser" || action === "addRow") {
    const saved = await insertRow("users", normalizeUser(data, true));
    return { message: "회원을 등록했습니다.", user: saved, data: saved };
  }

  if (action === "updateUser" || action === "updateRow") {
    const row = normalizeUser(data, false);
    const userId = text(data.userId || data.user_id || row.user_id);
    const saved = await updateRow("users", "user_id", userId, row);
    return { message: "회원 정보를 수정했습니다.", user: saved, data: saved };
  }

  if (action === "approveUser") {
    const userId = text(data.userId || data.user_id);
    const now = nowIso();
    const saved = await updateRow("users", "user_id", userId, { status: "승인완료", approved_at: now, updated_at: now });
    return { message: "회원을 승인했습니다.", user: saved, data: saved };
  }

  if (action === "rejectUser" || action === "denyUser") {
    const userId = text(data.userId || data.user_id);
    const now = nowIso();
    const saved = await updateRow("users", "user_id", userId, { status: "반려", rejected_at: now, updated_at: now });
    return { message: "회원을 반려했습니다.", user: saved, data: saved };
  }

  throw new Error(`지원하지 않는 회원 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const users = await selectRows("users", { orderColumn: "created_at", ascending: false });
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-users", users, data: { users }, counts: { users: users.length }, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "회원 조회에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-users", elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "회원 처리에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

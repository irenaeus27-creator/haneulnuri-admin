import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "instructor-photos";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function extensionFromType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

type JsonRecord = Record<string, unknown>;

async function updateInstructorPhoto(instructorId: string, photoUrl: string | null) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("instructors")
    .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
    .eq("instructor_id", instructorId)
    .select("*")
    .single();

  if (error) throw error;
  return data as JsonRecord;
}

async function syncUserPhotoFromInstructor(instructor: JsonRecord, photoUrl: string | null) {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();
  const email = text(instructor.email).toLowerCase();
  const phone = text(instructor.phone);
  const name = text(instructor.name);

  const payload = { photo_url: photoUrl, updated_at: now };

  async function updateBy(column: string, value: string) {
    if (!value) return 0;
    const { data, error } = await supabase
      .from("users")
      .update(payload)
      .eq(column, value)
      .select("user_id");

    if (error) {
      const message = error.message || "";
      if (message.includes("photo_url") || message.includes("schema cache") || message.includes("Could not find")) return 0;
      throw error;
    }
    return Array.isArray(data) ? data.length : 0;
  }

  let updatedCount = 0;
  updatedCount += await updateBy("email", email);
  if (updatedCount === 0) updatedCount += await updateBy("phone", phone);
  if (updatedCount === 0 && name) {
    const { data, error } = await supabase
      .from("users")
      .update(payload)
      .eq("name", name)
      .or("role.eq.교관,member_type.eq.교관")
      .select("user_id");

    if (error) {
      const message = error.message || "";
      if (!(message.includes("photo_url") || message.includes("schema cache") || message.includes("Could not find"))) throw error;
    } else {
      updatedCount += Array.isArray(data) ? data.length : 0;
    }
  }

  return updatedCount;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const formData = await request.formData();
    const instructorId = text(formData.get("instructorId"));
    const file = formData.get("file");

    if (!instructorId) throw new Error("교관 ID가 없습니다.");
    if (!(file instanceof File)) throw new Error("업로드할 사진 파일이 없습니다.");
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.");
    if (file.size > MAX_SIZE) throw new Error("사진은 5MB 이하만 업로드할 수 있습니다.");

    const supabase = getSupabaseServerClient();
    const ext = extensionFromType(file.type);
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const path = `${safePathPart(instructorId)}/profile-${timestamp}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const photoUrl = publicData.publicUrl;
    const instructor = await updateInstructorPhoto(instructorId, photoUrl);
    const syncedUsers = await syncUserPhotoFromInstructor(instructor, photoUrl);

    return NextResponse.json({
      ok: true,
      success: true,
      message: "사진을 업로드했습니다.",
      photoUrl,
      path,
      data: instructor,
      syncedUsers,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : "사진 업로드에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const instructorId = text(body.instructorId || body.instructor_id);
    if (!instructorId) throw new Error("교관 ID가 없습니다.");
    const instructor = await updateInstructorPhoto(instructorId, null);
    const syncedUsers = await syncUserPhotoFromInstructor(instructor, null);

    return NextResponse.json({
      ok: true,
      success: true,
      message: "사진을 제거했습니다.",
      photoUrl: "",
      data: instructor,
      syncedUsers,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : "사진 제거에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

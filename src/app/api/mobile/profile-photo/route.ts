import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getMobileAuthContext, text } from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "user-photos";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFromType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

async function updateUserPhoto(userId: string, photoUrl: string | null) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    if (error.message.includes("photo_url")) {
      throw new Error("users 테이블에 photo_url 컬럼이 없습니다. 먼저 Supabase SQL 패치를 실행해주세요.");
    }
    throw error;
  }

  return data;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const contentType = request.headers.get("content-type") || "";
    const { searchParams } = new URL(request.url);

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const mode = text(body.mode || body.action);
      const context = await getMobileAuthContext(request, text(body.userId || body.user_id || searchParams.get("userId")));

      if (mode === "delete" || mode === "remove") {
        const user = await updateUserPhoto(context.userId, null);
        return NextResponse.json({
          ok: true,
          success: true,
          message: "프로필 사진을 제거했습니다.",
          photoUrl: "",
          userId: context.userId,
          data: user,
          elapsedMs: Date.now() - startedAt,
        });
      }

      throw new Error("지원하지 않는 요청입니다.");
    }

    const formData = await request.formData();
    const context = await getMobileAuthContext(request, text(formData.get("userId") || searchParams.get("userId")));
    const file = formData.get("file");

    if (!(file instanceof File)) throw new Error("업로드할 사진 파일이 없습니다.");
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.");
    if (file.size > MAX_SIZE) throw new Error("사진은 5MB 이하만 업로드할 수 있습니다.");

    const supabase = getSupabaseServerClient();
    const ext = extensionFromType(file.type);
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const path = `${safePathPart(context.userId)}/profile-${timestamp}.${ext}`;
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
    const user = await updateUserPhoto(context.userId, photoUrl);

    return NextResponse.json({
      ok: true,
      success: true,
      message: "프로필 사진을 저장했습니다.",
      photoUrl,
      path,
      userId: context.userId,
      data: user,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필 사진 업로드에 실패했습니다.";
    const status = text(message).includes("로그인") || text(message).includes("토큰") ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message,
        elapsedMs: Date.now() - startedAt,
      },
      { status },
    );
  }
}

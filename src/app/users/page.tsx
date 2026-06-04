"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";

type UserRow = {
  userId?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  status?: string;
  createdAt?: string;
  requestedAt?: string;
  approvedAt?: string;
  memo?: string;
  [key: string]: unknown;
};

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function raw(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  const status = raw(value).replace(/\s/g, "");

  if (["승인완료", "승인", "approved", "활성"].includes(status)) return "승인완료";
  if (["승인대기", "요청", "대기", "pending", "가입요청"].includes(status)) return "승인대기";
  if (["반려", "거절", "rejected"].includes(status)) return "반려";
  if (["정지", "차단", "blocked"].includes(status)) return "정지";

  return status || "-";
}

function canBook(value: unknown) {
  return normalizeStatus(value) === "승인완료";
}

function isPending(value: unknown) {
  return normalizeStatus(value) === "승인대기";
}

function formatDateTime(value: unknown) {
  const rawText = raw(value);

  if (!rawText) return "-";

  const isoUtc = rawText.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/);

  if (isoUtc) {
    const date = new Date(rawText);
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);

    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kst.getUTCDate()).padStart(2, "0");
    const hour = String(kst.getUTCHours()).padStart(2, "0");
    const minute = String(kst.getUTCMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  const localLike = rawText.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  if (localLike) return `${localLike[1]} ${localLike[2]}`;

  const dateOnly = rawText.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return rawText;

  return rawText.replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, "");
}

function getStatusBadgeClass(status: unknown) {
  const normalized = normalizeStatus(status);

  if (normalized === "승인완료") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "승인대기") return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "반려") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "정지") return "border-slate-200 bg-slate-100 text-slate-600";

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getRoleLabel(role: unknown) {
  const value = raw(role);

  const labels: Record<string, string> = {
    admin: "관리자",
    instructor: "교관",
    student: "교육생",
    user: "일반회원",
    rental: "렌탈회원",
    체험회원: "체험회원",
    교육생: "교육생",
    렌탈회원: "렌탈회원",
    관리자: "관리자",
  };

  return labels[value] || value || "-";
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [roleFilter, setRoleFilter] = useState("전체");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const response = await fetch("/api/users", {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await response.text();

      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      let data: {
        ok?: boolean;
        success?: boolean;
        message?: string;
        users?: UserRow[];
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(data.message || "회원 데이터를 불러오지 못했습니다.");
      }

      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원 데이터를 불러오지 못했습니다.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers(true);
  }, [loadUsers]);

  const roleOptions = useMemo(() => {
    const values = users.map((item) => raw(item.role)).filter(Boolean);
    return ["전체", ...Array.from(new Set(values))];
  }, [users]);

  const statusOptions = ["전체", "승인대기", "승인완료", "반려", "정지"];

  const filteredUsers = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return users.filter((item) => {
      const status = normalizeStatus(item.status);

      if (statusFilter !== "전체" && status !== statusFilter) return false;
      if (roleFilter !== "전체" && raw(item.role) !== roleFilter) return false;

      if (!q) return true;

      const searchText = [
        item.userId,
        item.name,
        item.phone,
        item.email,
        item.role,
        normalizeStatus(item.status),
        item.createdAt,
        item.requestedAt,
        item.approvedAt,
        item.memo,
      ]
        .map((value) => raw(value))
        .join(" ")
        .toLowerCase();

      return searchText.includes(q);
    });
  }, [users, keyword, statusFilter, roleFilter]);

  const pendingCount = users.filter((item) => isPending(item.status)).length;
  const approvedCount = users.filter((item) => canBook(item.status)).length;
  const rejectedCount = users.filter((item) => normalizeStatus(item.status) === "반려").length;

  async function updateUserStatus(user: UserRow, action: "approveUser" | "rejectUser") {
    const userId = raw(user.userId);

    if (!userId) {
      alert("userId가 없습니다.");
      return;
    }

    if (action === "rejectUser") {
      const ok = window.confirm("이 회원을 반려 처리할까요?");
      if (!ok) return;
    }

    try {
      setSavingId(userId);

      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          userId,
          data: {
            ...user,
            userId,
          },
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      let data: {
        ok?: boolean;
        success?: boolean;
        message?: string;
        user?: UserRow;
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(
          data.message ||
            (action === "approveUser" ? "회원 승인에 실패했습니다." : "회원 반려에 실패했습니다.")
        );
      }

      const nextStatus = action === "approveUser" ? "승인완료" : "반려";
      const timeKey = action === "approveUser" ? "approvedAt" : "rejectedAt";
      const now = new Date().toISOString();

      setUsers((prev) =>
        prev.map((item) =>
          raw(item.userId) === userId
            ? {
                ...item,
                ...(data.user || {}),
                userId,
                status: nextStatus,
                [timeKey]: raw((data.user || {})[timeKey]) || now,
              }
            : item
        )
      );

      alert(action === "approveUser" ? "회원이 승인되었습니다. 이제 앱에서 예약할 수 있습니다." : "회원이 반려되었습니다.");
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : action === "approveUser"
            ? "회원 승인에 실패했습니다."
            : "회원 반려에 실패했습니다."
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <PageContainer title="회원관리" description="앱 가입 회원의 승인 상태와 예약 권한을 관리합니다.">
      <ContentCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#10213f]">회원 검색 및 승인 관리</h2>
            <p className="mt-1 text-[13px] font-medium text-[#6f8199]">기본값은 전체 역할 · 전체 상태입니다. 승인대기 회원만 승인 또는 반려 처리할 수 있습니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#526a89]">
            <span className="rounded-full border border-[#dbe5f1] bg-[#f8fbff] px-3 py-1.5">전체 {users.length}명</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">대기 {pendingCount}명</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">승인 {approvedCount}명</span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-700">반려 {rejectedCount}명</span>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[180px_180px_minmax(320px,1fr)_130px] md:grid-cols-2">
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="ui-input">
            {roleOptions.map((item) => (
              <option key={item} value={item}>
                {item === "전체" ? "전체 역할" : getRoleLabel(item)}
              </option>
            ))}
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ui-input">
            {statusOptions.map((item) => (
              <option key={item} value={item}>
                {item === "전체" ? "전체 상태" : item}
              </option>
            ))}
          </select>

          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="이름, 전화번호, 이메일, 역할, 상태 검색"
            className="ui-input"
          />

          <button type="button" onClick={() => void loadUsers(true)} className="ui-btn ui-btn-primary h-[46px]" disabled={loading}>
            {loading ? "로딩 중" : "새로고침"}
          </button>
        </div>
      </ContentCard>

      {error ? (
        <ContentCard className="border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </ContentCard>
      ) : null}

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#10213f]">회원 목록</h2>
            <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
              회원 정보, 승인 상태, 앱 예약권한을 한 화면에서 확인합니다.
            </p>
          </div>
          <span className="ui-badge border-[#dbe5f1] bg-[#f4f8fd] text-[#526a89]">
            표시 {filteredUsers.length}건
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-medium text-[#6f8199]">회원 데이터를 불러오는 중입니다.</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-sm font-medium text-[#6f8199]">표시할 회원이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto px-6 pb-6">
            <table className="ui-table min-w-[1180px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>역할</th>
                  <th>상태</th>
                  <th>앱 예약권한</th>
                  <th>신청/승인일</th>
                  <th>메모</th>
                  <th className="text-right">관리</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((item, index) => {
                  const userId = raw(item.userId);
                  const normalized = normalizeStatus(item.status);
                  const approved = canBook(item.status);
                  const rejected = normalized === "반려";
                  const pending = isPending(item.status);

                  return (
                    <tr key={`${userId || "user"}-${index}`} className="align-middle hover:bg-[#fbfdff]">
                      <td>
                        <div className="text-[14px] font-semibold text-[#10213f]">{text(item.name)}</div>
                        <div className="mt-1 text-[12px] font-medium text-[#6f8199]">{userId || "-"}</div>
                      </td>

                      <td>
                        <div className="text-[13px] font-semibold text-[#243b63]">{text(item.phone)}</div>
                        <div className="mt-1 text-[12px] font-medium text-[#6f8199]">{text(item.email)}</div>
                      </td>

                      <td><span className="text-[13px] font-medium text-[#243b63]">{getRoleLabel(item.role)}</span></td>

                      <td>
                        <span className={`ui-badge ${getStatusBadgeClass(item.status)}`}>
                          {normalized}
                        </span>
                      </td>

                      <td>
                        {approved ? (
                          <span className="ui-badge border-emerald-200 bg-emerald-50 text-emerald-700">예약 가능</span>
                        ) : (
                          <span className="ui-badge border-slate-200 bg-slate-100 text-slate-600">예약 불가</span>
                        )}
                      </td>

                      <td>
                        <div className="text-[13px] font-medium text-[#243b63]">신청 {formatDateTime(item.requestedAt || item.createdAt)}</div>
                        <div className="mt-1 text-[12px] font-medium text-[#6f8199]">승인 {formatDateTime(item.approvedAt)}</div>
                      </td>

                      <td className="max-w-[280px] truncate text-[13px] font-medium text-[#526a89]">{text(item.memo)}</td>

                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={approved || savingId === userId}
                            onClick={() => void updateUserStatus(item, "approveUser")}
                            className={`ui-btn h-9 px-3 text-[12px] ${
                              approved
                                ? "border border-slate-200 bg-slate-100 text-slate-400"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            }`}
                          >
                            {savingId === userId ? "처리 중" : approved ? "승인완료" : "승인"}
                          </button>

                          <button
                            type="button"
                            disabled={rejected || savingId === userId}
                            onClick={() => void updateUserStatus(item, "rejectUser")}
                            className={`ui-btn h-9 px-3 text-[12px] ${
                              rejected
                                ? "border border-slate-200 bg-slate-100 text-slate-400"
                                : "bg-rose-600 text-white hover:bg-rose-700"
                            }`}
                          >
                            반려
                          </button>
                        </div>

                        {!pending && !approved && !rejected ? (
                          <div className="mt-2 text-[12px] font-medium text-amber-600">
                            상태값 확인 필요: {text(item.status)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ContentCard>
    </PageContainer>
  );
}

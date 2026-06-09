"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";

type UserRow = {
  userId?: string;
  user_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  status?: string;
  memberType?: string;
  member_type?: string;
  createdAt?: string;
  created_at?: string;
  requestedAt?: string;
  requested_at?: string;
  approvedAt?: string;
  approved_at?: string;
  rejectedAt?: string;
  rejected_at?: string;
  updatedAt?: string;
  updated_at?: string;
  memo?: string;
  [key: string]: unknown;
};

type UserForm = {
  name: string;
  phone: string;
  email: string;
  role: string;
  status: string;
  memo: string;
};

type DrawerMode = "detail" | "edit" | null;

const ROLE_OPTIONS = ["교육생", "렌탈기장", "렌탈회원", "교관", "관리자", "일반회원", "체험회원"];
const STATUS_OPTIONS = ["승인대기", "승인완료", "반려", "정지"];

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function raw(value: unknown) {
  return String(value ?? "").trim();
}

function getUserId(row: UserRow) {
  return raw(row.userId || row.user_id);
}

function getRequestedAt(row: UserRow) {
  return row.requestedAt || row.requested_at || row.createdAt || row.created_at;
}

function getApprovedAt(row: UserRow) {
  return row.approvedAt || row.approved_at;
}

function getRejectedAt(row: UserRow) {
  return row.rejectedAt || row.rejected_at;
}

function getUpdatedAt(row: UserRow) {
  return row.updatedAt || row.updated_at;
}

function formatPhone(value: unknown) {
  const digits = raw(value).replace(/\D/g, "");
  if (!digits) return "-";
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw(value);
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

  const dateOnly = rawText.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return rawText;

  const normalized = rawText.includes("T") ? rawText : rawText.replace(" ", "T");
  const date = new Date(normalized);

  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(date)
      .replace(/\. /g, "-")
      .replace(/\./g, "")
      .replace(/, /g, " ");
  }

  const localLike = rawText.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?/);
  if (localLike) return `${localLike[1]} ${localLike[2]}`;

  return rawText.replace("T", " ").replace(/\.\d+(?:Z|[+-]\d{2}:?\d{2})?$/, "").replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "");
}

function getProcessedAtLabel(status: unknown) {
  const normalized = normalizeStatus(status);

  if (normalized === "승인완료") return "승인";
  if (normalized === "반려") return "반려";
  if (normalized === "정지") return "정지";

  return "처리";
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
    rental_pilot: "렌탈기장",
    rentalPilot: "렌탈기장",
    "렌탈기장": "렌탈기장",
    체험회원: "체험회원",
    교육생: "교육생",
    렌탈회원: "렌탈회원",
    관리자: "관리자",
  };

  return labels[value] || value || "-";
}

function toForm(row: UserRow): UserForm {
  return {
    name: raw(row.name),
    phone: raw(row.phone).replace(/\D/g, ""),
    email: raw(row.email),
    role: getRoleLabel(row.role) === "-" ? "일반회원" : getRoleLabel(row.role),
    status: normalizeStatus(row.status) === "-" ? "승인대기" : normalizeStatus(row.status),
    memo: raw(row.memo),
  };
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-[#e3ebf6] bg-[#f8fbff] px-4 py-3">
      <div className="text-[11px] font-semibold text-[#7d8faa]">{label}</div>
      <div className="mt-1 break-words text-[13px] font-semibold text-[#10213f]">{text(value)}</div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [roleFilter, setRoleFilter] = useState("전체");
  const [error, setError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>({ name: "", phone: "", email: "", role: "일반회원", status: "승인대기", memo: "" });

  const loadUsers = useCallback(async (showLoading = true, forceFresh = false) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const response = await fetch(`/api/users?${forceFresh ? "noCache=1&" : ""}_ts=${Date.now()}`, {
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
    void loadUsers(true, false);
  }, [loadUsers]);

  const roleOptions = useMemo(() => {
    const values = users.map((item) => getRoleLabel(item.role)).filter((item) => item !== "-");
    return ["전체", ...Array.from(new Set([...ROLE_OPTIONS, ...values]))];
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return users.filter((item) => {
      const status = normalizeStatus(item.status);
      const roleLabel = getRoleLabel(item.role);

      if (statusFilter !== "전체" && status !== statusFilter) return false;
      if (roleFilter !== "전체" && roleLabel !== roleFilter) return false;

      if (!q) return true;

      const searchText = [
        getUserId(item),
        item.name,
        item.phone,
        formatPhone(item.phone),
        item.email,
        roleLabel,
        normalizeStatus(item.status),
        getRequestedAt(item),
        getApprovedAt(item),
        getRejectedAt(item),
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

  function closeDrawer() {
    setDrawerMode(null);
    setSelectedUser(null);
  }

  function openDetail(user: UserRow) {
    setSelectedUser(user);
    setForm(toForm(user));
    setDrawerMode("detail");
  }

  function openEdit(user: UserRow) {
    setSelectedUser(user);
    setForm(toForm(user));
    setDrawerMode("edit");
  }

  async function updateUserStatus(user: UserRow, action: "approveUser" | "rejectUser") {
    const userId = getUserId(user);

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
      setOperationMessage(action === "approveUser" ? "회원 승인 처리 중입니다..." : "회원 반려 처리 중입니다...");

      const response = await fetch("/api/users?noCache=1", {
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
        throw new Error(data.message || (action === "approveUser" ? "회원 승인에 실패했습니다." : "회원 반려에 실패했습니다."));
      }

      await loadUsers(false, true);
      if (selectedUser && getUserId(selectedUser) === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, ...(data.user || {}), status: action === "approveUser" ? "승인완료" : "반려" } : prev));
      }
      alert(action === "approveUser" ? "회원이 승인되었습니다." : "회원이 반려되었습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : action === "approveUser" ? "회원 승인에 실패했습니다." : "회원 반려에 실패했습니다.");
    } finally {
      setSavingId(null);
      setOperationMessage("");
    }
  }

  async function saveUser() {
    if (!selectedUser) return;

    const userId = getUserId(selectedUser);
    if (!userId) {
      alert("userId가 없습니다.");
      return;
    }

    try {
      setSavingId(userId);
      setOperationMessage("회원 정보를 저장하는 중입니다...");

      const response = await fetch("/api/users?noCache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateUser",
          userId,
          data: {
            ...selectedUser,
            userId,
            user_id: userId,
            name: form.name.trim(),
            phone: form.phone.replace(/\D/g, ""),
            email: form.email.trim(),
            role: form.role,
            status: form.status,
            memo: form.memo.trim(),
          },
        }),
      });

      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      let data: { ok?: boolean; success?: boolean; message?: string; user?: UserRow };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(data.message || "회원 정보 저장에 실패했습니다.");
      }

      await loadUsers(false, true);
      closeDrawer();
      alert("회원 정보를 저장했습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "회원 정보 저장에 실패했습니다.");
    } finally {
      setSavingId(null);
      setOperationMessage("");
    }
  }

  return (
    <PageContainer title="회원관리" description="앱 가입 회원의 승인 상태와 계정 기본정보를 관리합니다.">
      {savingId || operationMessage ? (
        <ContentCard className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
          {operationMessage || "회원 정보를 저장하는 중입니다..."}
        </ContentCard>
      ) : null}
      <ContentCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#10213f]">회원 검색 및 승인 관리</h2>
            <p className="mt-1 text-[13px] font-medium text-[#6f8199]">승인대기 회원은 승인/반려 처리하고, 승인된 회원은 자세히 보기 또는 수정으로 관리합니다.</p>
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
                {item === "전체" ? "전체 역할" : item}
              </option>
            ))}
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ui-input">
            {["전체", ...STATUS_OPTIONS].map((item) => (
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

          <button type="button" onClick={() => void loadUsers(true, true)} className="ui-btn ui-btn-primary h-[46px]" disabled={loading}>
            {loading ? "로딩 중" : "새로고침"}
          </button>
        </div>
      </ContentCard>

      {error ? (
        <ContentCard className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadUsers(true, true)} className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
            다시 시도
          </button>
        </ContentCard>
      ) : null}

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#10213f]">회원 목록</h2>
            <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
              회원 기본정보와 가입 승인 상태를 확인합니다. 상세 정보는 자세히 보기에서 확인할 수 있습니다.
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
            <table className="ui-table min-w-[1080px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>역할</th>
                  <th>상태</th>
                  <th>신청/처리일</th>
                  <th>메모</th>
                  <th className="text-right">관리</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((item, index) => {
                  const userId = getUserId(item);
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
                        <div className="text-[13px] font-semibold text-[#243b63]">{formatPhone(item.phone)}</div>
                        <div className="mt-1 text-[12px] font-medium text-[#6f8199]">{text(item.email)}</div>
                      </td>

                      <td><span className="text-[13px] font-medium text-[#243b63]">{getRoleLabel(item.role)}</span></td>

                      <td>
                        <span className={`ui-badge ${getStatusBadgeClass(item.status)}`}>
                          {normalized}
                        </span>
                      </td>

                      <td>
                        <div className="whitespace-nowrap text-[13px] font-medium text-[#243b63]">신청 {formatDateTime(getRequestedAt(item))}</div>
                        <div className="mt-1 whitespace-nowrap text-[12px] font-medium text-[#6f8199]">
                          {getProcessedAtLabel(item.status)} {formatDateTime(getApprovedAt(item) || getRejectedAt(item) || getUpdatedAt(item))}
                        </div>
                      </td>

                      <td className="max-w-[280px] truncate text-[13px] font-medium text-[#526a89]">{text(item.memo)}</td>

                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetail(item)}
                            className="ui-btn h-9 border border-[#dbe5f1] bg-white px-3 text-[12px] text-[#243b63] hover:bg-[#f4f8fd]"
                          >
                            자세히
                          </button>

                          {pending ? (
                            <>
                              <button
                                type="button"
                                disabled={savingId === userId}
                                onClick={() => void updateUserStatus(item, "approveUser")}
                                className="ui-btn h-9 bg-emerald-600 px-3 text-[12px] text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingId === userId ? "처리 중" : "승인"}
                              </button>

                              <button
                                type="button"
                                disabled={savingId === userId}
                                onClick={() => void updateUserStatus(item, "rejectUser")}
                                className="ui-btn h-9 bg-rose-600 px-3 text-[12px] text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                반려
                              </button>
                            </>
                          ) : approved ? (
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="ui-btn h-9 border border-blue-200 bg-blue-50 px-3 text-[12px] text-blue-700 hover:bg-blue-100"
                            >
                              수정
                            </button>
                          ) : rejected ? (
                            <button
                              type="button"
                              disabled={savingId === userId}
                              onClick={() => void updateUserStatus(item, "approveUser")}
                              className="ui-btn h-9 border border-[#dbe5f1] bg-white px-3 text-[12px] text-[#243b63] hover:bg-[#f4f8fd] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingId === userId ? "처리 중" : "재승인"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="ui-btn h-9 border border-[#dbe5f1] bg-white px-3 text-[12px] text-[#243b63] hover:bg-[#f4f8fd]"
                            >
                              수정
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ContentCard>

      {drawerMode && selectedUser ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#10213f]/25 backdrop-blur-[1px]" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}>
          <aside className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl">
            <div className="border-b border-[#dbe5f1] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-blue-600">USER DETAIL</div>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#10213f]">
                    {drawerMode === "edit" ? "회원 정보 수정" : "회원 상세 정보"}
                  </h2>
                  <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
                    {drawerMode === "edit" ? "회원 계정의 기본 정보, 역할, 상태, 메모를 수정합니다." : "앱 가입 회원의 기본 정보와 처리 이력을 확인합니다."}
                  </p>
                </div>
                <button type="button" onClick={closeDrawer} className="rounded-full border border-[#dbe5f1] px-3 py-1.5 text-[13px] font-semibold text-[#526a89] hover:bg-[#f4f8fd]">
                  닫기
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {drawerMode === "detail" ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[#dbe5f1] bg-[#f8fbff] p-5">
                    <div>
                      <div className="text-[20px] font-semibold text-[#10213f]">{text(selectedUser.name)}</div>
                      <div className="mt-1 text-[13px] font-medium text-[#6f8199]">{getUserId(selectedUser) || "-"}</div>
                    </div>
                    <span className={`ui-badge ${getStatusBadgeClass(selectedUser.status)}`}>{normalizeStatus(selectedUser.status)}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailItem label="연락처" value={formatPhone(selectedUser.phone)} />
                    <DetailItem label="이메일" value={selectedUser.email} />
                    <DetailItem label="역할" value={getRoleLabel(selectedUser.role)} />
                    <DetailItem label="회원 유형" value={selectedUser.memberType || selectedUser.member_type} />
                    <DetailItem label="신청일" value={formatDateTime(getRequestedAt(selectedUser))} />
                    <DetailItem label="승인일" value={formatDateTime(getApprovedAt(selectedUser))} />
                    <DetailItem label="반려일" value={formatDateTime(getRejectedAt(selectedUser))} />
                    <DetailItem label="최근 수정일" value={formatDateTime(getUpdatedAt(selectedUser))} />
                  </div>

                  <div className="rounded-2xl border border-[#e3ebf6] bg-white p-4">
                    <div className="text-[12px] font-semibold text-[#7d8faa]">메모</div>
                    <div className="mt-2 whitespace-pre-wrap text-[13px] font-medium leading-6 text-[#243b63]">{text(selectedUser.memo)}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#526a89]">이름</span>
                    <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className="ui-input" />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#526a89]">전화번호</span>
                      <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value.replace(/\D/g, "") }))} className="ui-input" placeholder="숫자만 입력" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#526a89]">이메일</span>
                      <input value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} className="ui-input" />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#526a89]">역할</span>
                      <select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))} className="ui-input">
                        {ROLE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#526a89]">상태</span>
                      <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} className="ui-input">
                        {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#526a89]">메모</span>
                    <textarea value={form.memo} onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))} className="ui-input min-h-[140px] resize-y py-3" placeholder="관리자 메모" />
                  </label>

                  <div className="rounded-2xl border border-[#e3ebf6] bg-[#f8fbff] p-4 text-[12px] font-medium leading-5 text-[#6f8199]">
                    회원 ID, 신청일, 승인/반려 처리 이력은 시스템 이력으로 보존합니다. 교육생 세부 정보와 렌탈기장 세부 정보는 각 전용 관리 메뉴에서 수정하세요.
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#dbe5f1] bg-[#f8fbff] px-6 py-4">
              {drawerMode === "detail" ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={closeDrawer} className="ui-btn border border-[#dbe5f1] bg-white px-4 text-[#243b63] hover:bg-[#f4f8fd]">닫기</button>
                  {isPending(selectedUser.status) ? (
                    <>
                      <button type="button" onClick={() => void updateUserStatus(selectedUser, "approveUser")} className="ui-btn bg-emerald-600 px-4 text-white hover:bg-emerald-700">승인</button>
                      <button type="button" onClick={() => void updateUserStatus(selectedUser, "rejectUser")} className="ui-btn bg-rose-600 px-4 text-white hover:bg-rose-700">반려</button>
                    </>
                  ) : normalizeStatus(selectedUser.status) === "반려" ? (
                    <button type="button" onClick={() => void updateUserStatus(selectedUser, "approveUser")} className="ui-btn border border-[#dbe5f1] bg-white px-4 text-[#243b63] hover:bg-[#f4f8fd]">재승인</button>
                  ) : (
                    <button type="button" onClick={() => setDrawerMode("edit")} className="ui-btn ui-btn-primary px-4">수정</button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={closeDrawer} className="ui-btn border border-[#dbe5f1] bg-white px-4 text-[#243b63] hover:bg-[#f4f8fd]">취소</button>
                  <button type="button" disabled={savingId === getUserId(selectedUser)} onClick={() => void saveUser()} className="ui-btn ui-btn-primary px-5 disabled:cursor-not-allowed disabled:opacity-60">
                    {savingId === getUserId(selectedUser) ? "저장 중" : "저장"}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </PageContainer>
  );
}

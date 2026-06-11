"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";

type JsonRow = Record<string, unknown>;

type UserRow = JsonRow & {
  userId?: string;
  user_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  status?: string;
  memberType?: string;
  member_type?: string;
  photoUrl?: string;
  photo_url?: string;
  requestedAt?: string;
  requested_at?: string;
  createdAt?: string;
  created_at?: string;
  approvedAt?: string;
  approved_at?: string;
  rejectedAt?: string;
  rejected_at?: string;
  updatedAt?: string;
  updated_at?: string;
  memo?: string;
};

type StudentRow = JsonRow & {
  studentId?: string;
  student_id?: string;
  userId?: string;
  user_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  course?: string;
  assignedAircraftIds?: string;
  assigned_aircraft_ids?: string;
};

type RentalPilotRow = JsonRow & {
  pilotId?: string;
  pilot_id?: string;
  userId?: string;
  user_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  assignedAircraftIds?: string;
  assigned_aircraft_ids?: string;
};

type AircraftRow = JsonRow & {
  aircraftId?: string;
  aircraft_id?: string;
  aircraftName?: string;
  aircraft_name?: string;
  registrationNo?: string;
  registration_no?: string;
  active?: string | boolean;
};

type InstructorRow = JsonRow & {
  instructorId?: string;
  instructor_id?: string;
  name?: string;
  status?: string;
  active?: string | boolean;
};

type UserForm = {
  name: string;
  phone: string;
  email: string;
  role: string;
  status: string;
  memo: string;
};

type ApprovalForm = {
  memberType: "교육생" | "렌탈회원";
  profileMode: "create" | "existing";
  existingStudentId: string;
  existingPilotId: string;
  course: string;
  licenseType: string;
  licenseNo: string;
  assignedInstructorId: string;
  assignedAircraftIds: string[];
  profileMemo: string;
};

type DrawerMode = "detail" | "edit" | "approval" | null;

const ROLE_OPTIONS = ["교육생", "렌탈회원", "교관", "관리자", "일반회원", "체험회원"];
const STATUS_OPTIONS = ["승인대기", "승인완료", "반려", "정지"];

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function raw(value: unknown) {
  return String(value ?? "").trim();
}


function getUserInitial(name: unknown) {
  const value = raw(name);
  return Array.from(value)[0] || "회";
}

function UserAvatar({ name, photoUrl, size = "sm" }: { name: unknown; photoUrl?: unknown; size?: "sm" | "lg" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = raw(photoUrl);
  const showImage = src.length > 0 && !imageFailed;
  const sizeClass = size === "lg" ? "h-16 w-16 rounded-3xl text-[18px]" : "h-10 w-10 rounded-2xl text-[13px]";

  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden border border-[#dbeafe] bg-[#eaf4ff] font-medium text-[#0b47b7]`}>
      {showImage ? (
        <img
          src={src}
          alt={`${text(name, "회원")} 사진`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        getUserInitial(name)
      )}
    </div>
  );
}

function getUserId(row: UserRow) {
  return raw(row.userId || row.user_id);
}

function getStudentId(row: StudentRow) {
  return raw(row.studentId || row.student_id);
}

function getPilotId(row: RentalPilotRow) {
  return raw(row.pilotId || row.pilot_id);
}

function getAircraftId(row: AircraftRow) {
  return raw(row.aircraftId || row.aircraft_id || row.registrationNo || row.registration_no);
}

function getInstructorId(row: InstructorRow) {
  return raw(row.instructorId || row.instructor_id);
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

  if (["승인완료", "승인", "승인됨", "approved", "active", "활성"].includes(status)) return "승인완료";
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

function normalizeMemberType(value: unknown) {
  const rawText = raw(value).replace(/\s/g, "");
  if (["student", "학생", "학생회원", "교육생", "교육생회원"].includes(rawText) || rawText.includes("교육")) return "교육생";
  if (["rental", "rental_pilot", "rentalPilot", "렌탈", "렌탈기장", "렌탈회원"].includes(rawText) || rawText.includes("렌탈")) return "렌탈회원";
  if (["admin", "관리자"].includes(rawText)) return "관리자";
  if (["instructor", "교관"].includes(rawText)) return "교관";
  return rawText || "일반회원";
}

function getRoleLabel(role: unknown) {
  return normalizeMemberType(role);
}

function formatDateTime(value: unknown) {
  const rawText = raw(value);
  if (!rawText) return "-";

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

function toForm(row: UserRow): UserForm {
  return {
    name: raw(row.name),
    phone: raw(row.phone).replace(/\D/g, ""),
    email: raw(row.email),
    role: getRoleLabel(row.memberType || row.member_type || row.role),
    status: normalizeStatus(row.status) === "-" ? "승인대기" : normalizeStatus(row.status),
    memo: raw(row.memo),
  };
}

function getDefaultApprovalForm(row: UserRow): ApprovalForm {
  const type = normalizeMemberType(row.memberType || row.member_type || row.role);
  return {
    memberType: type === "렌탈회원" ? "렌탈회원" : "교육생",
    profileMode: "create",
    existingStudentId: "",
    existingPilotId: "",
    course: "교육",
    licenseType: "",
    licenseNo: "",
    assignedInstructorId: "",
    assignedAircraftIds: [],
    profileMemo: raw(row.memo),
  };
}

function aircraftLabel(row: AircraftRow) {
  const id = getAircraftId(row);
  const name = raw(row.aircraftName || row.aircraft_name);
  return name && name !== id ? `${name} / ${id}` : id || name || "항공기";
}

function instructorLabel(row: InstructorRow) {
  const id = getInstructorId(row);
  const name = raw(row.name);
  return id ? `${name || "교관"} / ${id}` : name || "교관";
}

function studentLabel(row: StudentRow) {
  return `${text(row.name)} / ${getStudentId(row)}`;
}

function pilotLabel(row: RentalPilotRow) {
  return `${text(row.name)} / ${getPilotId(row)}`;
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-[#e3ebf6] bg-[#f8fbff] px-4 py-3">
      <div className="text-[11px] font-medium text-[#7d8faa]">{label}</div>
      <div className="mt-1 break-words text-[13px] font-medium text-[#10213f]">{text(value)}</div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [rentalPilots, setRentalPilots] = useState<RentalPilotRow[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRow[]>([]);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
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
  const [approvalForm, setApprovalForm] = useState<ApprovalForm | null>(null);

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
        students?: StudentRow[];
        rentalPilots?: RentalPilotRow[];
        aircraft?: AircraftRow[];
        instructors?: InstructorRow[];
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
      setStudents(Array.isArray(data.students) ? data.students : []);
      setRentalPilots(Array.isArray(data.rentalPilots) ? data.rentalPilots : []);
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
      setInstructors(Array.isArray(data.instructors) ? data.instructors : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원 데이터를 불러오지 못했습니다.");
      setUsers([]);
      setStudents([]);
      setRentalPilots([]);
      setAircraft([]);
      setInstructors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers(true, false);
  }, [loadUsers]);

  const roleOptions = useMemo(() => {
    const values = users.map((item) => getRoleLabel(item.memberType || item.member_type || item.role)).filter((item) => item !== "-");
    return ["전체", ...Array.from(new Set([...ROLE_OPTIONS, ...values]))];
  }, [users]);

  const activeAircraft = useMemo(() => aircraft.filter((item) => raw(item.active).toLowerCase() !== "false" && raw(item.active) !== "N"), [aircraft]);
  const activeInstructors = useMemo(() => instructors.filter((item) => raw(item.active).toLowerCase() !== "false" && raw(item.status) !== "퇴사"), [instructors]);

  const filteredUsers = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return users.filter((item) => {
      const status = normalizeStatus(item.status);
      const roleLabel = getRoleLabel(item.memberType || item.member_type || item.role);

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
    setApprovalForm(null);
  }

  function openDetail(user: UserRow) {
    setSelectedUser(user);
    setForm(toForm(user));
    setApprovalForm(getDefaultApprovalForm(user));
    setDrawerMode("detail");
  }

  function openEdit(user: UserRow) {
    setSelectedUser(user);
    setForm(toForm(user));
    setApprovalForm(getDefaultApprovalForm(user));
    setDrawerMode("edit");
  }

  function openApproval(user: UserRow) {
    setSelectedUser(user);
    setForm(toForm(user));
    setApprovalForm(getDefaultApprovalForm(user));
    setDrawerMode("approval");
  }

  async function rejectUser(user: UserRow) {
    const userId = getUserId(user);
    if (!userId) {
      alert("userId가 없습니다.");
      return;
    }

    const ok = window.confirm("이 회원을 반려 처리할까요?");
    if (!ok) return;

    try {
      setSavingId(userId);
      setOperationMessage("회원 반려 처리 중입니다...");

      const response = await fetch("/api/users?noCache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rejectUser", userId, data: { userId } }),
      });

      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");
      const data = JSON.parse(rawText) as { ok?: boolean; success?: boolean; message?: string };
      if (!response.ok || (!data.ok && !data.success)) throw new Error(data.message || "회원 반려에 실패했습니다.");

      await loadUsers(false, true);
      closeDrawer();
      alert("회원이 반려되었습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "회원 반려에 실패했습니다.");
    } finally {
      setSavingId(null);
      setOperationMessage("");
    }
  }

  async function approveWithProfile() {
    if (!selectedUser || !approvalForm) return;

    const userId = getUserId(selectedUser);
    if (!userId) {
      alert("userId가 없습니다.");
      return;
    }

    if (approvalForm.memberType === "교육생" && approvalForm.profileMode === "existing" && !approvalForm.existingStudentId) {
      alert("연결할 기존 교육생을 선택해주세요.");
      return;
    }

    if (approvalForm.memberType === "렌탈회원" && approvalForm.profileMode === "existing" && !approvalForm.existingPilotId) {
      alert("연결할 기존 렌탈회원을 선택해주세요.");
      return;
    }

    if (approvalForm.assignedAircraftIds.length === 0) {
      const ok = window.confirm("배정 항공기가 없습니다. 그래도 승인할까요? 앱 예약 화면에는 항공기가 표시되지 않습니다.");
      if (!ok) return;
    }

    try {
      setSavingId(userId);
      setOperationMessage("회원 연결/생성 후 승인 처리 중입니다...");

      const instructor = activeInstructors.find((item) => getInstructorId(item) === approvalForm.assignedInstructorId);

      const payload = {
        ...selectedUser,
        userId,
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        email: form.email.trim(),
        memo: form.memo.trim(),
        memberType: approvalForm.memberType,
        profileMode: approvalForm.profileMode,
        existingStudentId: approvalForm.existingStudentId,
        existingPilotId: approvalForm.existingPilotId,
        course: approvalForm.course.trim(),
        licenseType: approvalForm.licenseType.trim(),
        licenseNo: approvalForm.licenseNo.trim(),
        assignedInstructorId: approvalForm.assignedInstructorId,
        assignedInstructorName: raw(instructor?.name),
        assignedAircraftIds: approvalForm.assignedAircraftIds.join(","),
        profileMemo: approvalForm.profileMemo.trim(),
      };

      const response = await fetch("/api/users?noCache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approveUserWithProfile", userId, data: payload }),
      });

      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");
      const data = JSON.parse(rawText) as { ok?: boolean; success?: boolean; message?: string };
      if (!response.ok || (!data.ok && !data.success)) throw new Error(data.message || "회원 승인에 실패했습니다.");

      await loadUsers(false, true);
      closeDrawer();
      alert("회원 연결/생성 후 승인했습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "회원 승인에 실패했습니다.");
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
            memberType: normalizeMemberType(form.role),
            status: form.status,
            memo: form.memo.trim(),
          },
        }),
      });

      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");
      const data = JSON.parse(rawText) as { ok?: boolean; success?: boolean; message?: string };
      if (!response.ok || (!data.ok && !data.success)) throw new Error(data.message || "회원 정보 저장에 실패했습니다.");

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
        <ContentCard className="border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-700">
          {operationMessage || "회원 정보를 저장하는 중입니다..."}
        </ContentCard>
      ) : null}

      <ContentCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-medium tracking-[-0.02em] text-[#10213f]">회원 검색 및 승인 관리</h2>
            <p className="mt-1 text-[13px] font-normal text-[#6f8199]">
              앱 가입 요청은 기존 교육생/렌탈회원과 연결하거나 신규 프로필을 생성한 뒤 승인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-normal text-[#526a89]">
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

          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="이름, 전화번호, 이메일, 역할, 상태 검색" className="ui-input" />

          <button type="button" onClick={() => void loadUsers(true, true)} className="ui-btn ui-btn-primary h-[46px]" disabled={loading}>
            {loading ? "로딩 중" : "새로고침"}
          </button>
        </div>
      </ContentCard>

      {error ? (
        <ContentCard className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadUsers(true, true)} className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
            다시 시도
          </button>
        </ContentCard>
      ) : null}

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h2 className="text-[18px] font-medium tracking-[-0.02em] text-[#10213f]">회원 목록</h2>
            <p className="mt-1 text-[13px] font-normal text-[#6f8199]">승인대기 회원은 승인 버튼에서 교육생/렌탈회원 프로필을 연결합니다.</p>
          </div>
          <span className="ui-badge border-[#dbe5f1] bg-[#f4f8fd] text-[#526a89]">표시 {filteredUsers.length}건</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-normal text-[#6f8199]">회원 데이터를 불러오는 중입니다.</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-sm font-normal text-[#6f8199]">표시할 회원이 없습니다.</div>
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
                  const roleLabel = getRoleLabel(item.memberType || item.member_type || item.role);
                  const photoUrl = text(item.photoUrl || item.photo_url);

                  return (
                    <tr key={`${userId || "user"}-${index}`} className="align-middle hover:bg-[#fbfdff]">
                      <td>
                        <div className="flex items-center gap-3">
                          <UserAvatar name={item.name} photoUrl={photoUrl} />
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-medium text-[#10213f]">{text(item.name)}</div>
                            <div className="mt-1 truncate text-[12px] font-normal text-[#6f8199]">{userId || "-"}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="text-[13px] font-medium text-[#243b63]">{formatPhone(item.phone)}</div>
                        <div className="mt-1 text-[12px] font-normal text-[#6f8199]">{text(item.email)}</div>
                      </td>

                      <td><span className="text-[13px] font-normal text-[#243b63]">{roleLabel}</span></td>

                      <td>
                        <span className={`ui-badge ${getStatusBadgeClass(item.status)}`}>{normalized}</span>
                      </td>

                      <td>
                        <div className="whitespace-nowrap text-[13px] font-normal text-[#243b63]">신청 {formatDateTime(getRequestedAt(item))}</div>
                        <div className="mt-1 whitespace-nowrap text-[12px] font-normal text-[#6f8199]">
                          {getProcessedAtLabel(item.status)} {formatDateTime(getApprovedAt(item) || getRejectedAt(item) || getUpdatedAt(item))}
                        </div>
                      </td>

                      <td className="max-w-[280px] truncate text-[13px] font-normal text-[#526a89]">{text(item.memo)}</td>

                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => openDetail(item)} className="ui-btn h-9 border border-[#dbe5f1] bg-white px-3 text-[12px] text-[#243b63] hover:bg-[#f4f8fd]">자세히</button>
                          {pending ? (
                            <>
                              <button type="button" disabled={savingId === userId} onClick={() => openApproval(item)} className="ui-btn h-9 bg-emerald-600 px-3 text-[12px] text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                                {savingId === userId ? "처리 중" : "승인"}
                              </button>
                              <button type="button" disabled={savingId === userId} onClick={() => void rejectUser(item)} className="ui-btn h-9 bg-rose-600 px-3 text-[12px] text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">반려</button>
                            </>
                          ) : approved ? (
                            <button type="button" onClick={() => openEdit(item)} className="ui-btn h-9 border border-blue-200 bg-blue-50 px-3 text-[12px] text-blue-700 hover:bg-blue-100">수정</button>
                          ) : rejected ? (
                            <button type="button" disabled={savingId === userId} onClick={() => openApproval(item)} className="ui-btn h-9 border border-[#dbe5f1] bg-white px-3 text-[12px] text-[#243b63] hover:bg-[#f4f8fd] disabled:cursor-not-allowed disabled:opacity-60">재승인</button>
                          ) : (
                            <button type="button" onClick={() => openEdit(item)} className="ui-btn h-9 border border-[#dbe5f1] bg-white px-3 text-[12px] text-[#243b63] hover:bg-[#f4f8fd]">수정</button>
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
        <div className="fixed inset-0 z-50 flex justify-end bg-[#10213f]/25 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
          <aside className="flex h-full w-full max-w-[640px] flex-col bg-white shadow-2xl">
            <div className="border-b border-[#dbe5f1] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-blue-600">USER DETAIL</div>
                  <h2 className="mt-1 text-[22px] font-medium tracking-[-0.03em] text-[#10213f]">
                    {drawerMode === "approval" ? "회원 승인 처리" : drawerMode === "edit" ? "회원 정보 수정" : "회원 상세 정보"}
                  </h2>
                  <p className="mt-1 text-[13px] font-normal text-[#6f8199]">
                    {drawerMode === "approval" ? "앱 계정을 기존 프로필과 연결하거나 신규 교육생/렌탈회원으로 생성합니다." : drawerMode === "edit" ? "회원 계정의 기본 정보, 역할, 상태, 메모를 수정합니다." : "앱 가입 회원의 기본 정보와 처리 이력을 확인합니다."}
                  </p>
                </div>
                <button type="button" onClick={closeDrawer} className="rounded-full border border-[#dbe5f1] px-3 py-1.5 text-[13px] font-medium text-[#526a89] hover:bg-[#f4f8fd]">닫기</button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {drawerMode === "detail" ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[#dbe5f1] bg-[#f8fbff] p-5">
                    <div className="flex items-center gap-4">
                      <UserAvatar name={selectedUser.name} photoUrl={selectedUser.photoUrl || selectedUser.photo_url} size="lg" />
                      <div>
                        <div className="text-[20px] font-medium text-[#10213f]">{text(selectedUser.name)}</div>
                        <div className="mt-1 text-[13px] font-normal text-[#6f8199]">{getUserId(selectedUser) || "-"}</div>
                      </div>
                    </div>
                    <span className={`ui-badge ${getStatusBadgeClass(selectedUser.status)}`}>{normalizeStatus(selectedUser.status)}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailItem label="연락처" value={formatPhone(selectedUser.phone)} />
                    <DetailItem label="이메일" value={selectedUser.email} />
                    <DetailItem label="역할" value={getRoleLabel(selectedUser.memberType || selectedUser.member_type || selectedUser.role)} />
                    <DetailItem label="회원 유형" value={normalizeMemberType(selectedUser.memberType || selectedUser.member_type || selectedUser.role)} />
                    <DetailItem label="신청일" value={formatDateTime(getRequestedAt(selectedUser))} />
                    <DetailItem label="승인일" value={formatDateTime(getApprovedAt(selectedUser))} />
                    <DetailItem label="반려일" value={formatDateTime(getRejectedAt(selectedUser))} />
                    <DetailItem label="최근 수정일" value={formatDateTime(getUpdatedAt(selectedUser))} />
                  </div>

                  <div className="rounded-2xl border border-[#e3ebf6] bg-white p-4">
                    <div className="text-[12px] font-medium text-[#7d8faa]">메모</div>
                    <div className="mt-2 whitespace-pre-wrap text-[13px] font-normal leading-6 text-[#243b63]">{text(selectedUser.memo)}</div>
                  </div>
                </div>
              ) : drawerMode === "approval" && approvalForm ? (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
                    <div className="text-[15px] font-medium text-[#10213f]">가입 요청 정보</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <DetailItem label="이름" value={form.name || selectedUser.name} />
                      <DetailItem label="연락처" value={formatPhone(form.phone || selectedUser.phone)} />
                      <DetailItem label="이메일" value={form.email || selectedUser.email} />
                      <DetailItem label="요청 유형" value={approvalForm.memberType} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">회원 유형</span>
                      <select value={approvalForm.memberType} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, memberType: event.target.value as "교육생" | "렌탈회원", profileMode: "create", existingStudentId: "", existingPilotId: "" } : prev)} className="ui-input">
                        <option value="교육생">교육생</option>
                        <option value="렌탈회원">렌탈회원</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">처리 방식</span>
                      <select value={approvalForm.profileMode} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, profileMode: event.target.value as "create" | "existing" } : prev)} className="ui-input">
                        <option value="create">신규 {approvalForm.memberType} 생성</option>
                        <option value="existing">기존 {approvalForm.memberType}과 연결</option>
                      </select>
                    </label>
                  </div>

                  {approvalForm.memberType === "교육생" ? (
                    <div className="space-y-4 rounded-3xl border border-[#dbe5f1] bg-white p-5">
                      <div className="text-[15px] font-medium text-[#10213f]">교육생 연결/등록 정보</div>
                      {approvalForm.profileMode === "existing" ? (
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">기존 교육생 선택</span>
                          <select value={approvalForm.existingStudentId} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, existingStudentId: event.target.value } : prev)} className="ui-input">
                            <option value="">교육생 선택</option>
                            {students.map((item) => <option key={getStudentId(item)} value={getStudentId(item)}>{studentLabel(item)}</option>)}
                          </select>
                        </label>
                      ) : null}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">교육과정</span>
                          <input value={approvalForm.course} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, course: event.target.value } : prev)} className="ui-input" placeholder="예: 교육" />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">면장/자격</span>
                          <input value={approvalForm.licenseType} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, licenseType: event.target.value } : prev)} className="ui-input" placeholder="선택 입력" />
                        </label>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">담당 교관</span>
                        <select value={approvalForm.assignedInstructorId} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, assignedInstructorId: event.target.value } : prev)} className="ui-input">
                          <option value="">미배정</option>
                          {activeInstructors.map((item) => <option key={getInstructorId(item)} value={getInstructorId(item)}>{instructorLabel(item)}</option>)}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-3xl border border-[#dbe5f1] bg-white p-5">
                      <div className="text-[15px] font-medium text-[#10213f]">렌탈회원 연결/등록 정보</div>
                      {approvalForm.profileMode === "existing" ? (
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">기존 렌탈회원 선택</span>
                          <select value={approvalForm.existingPilotId} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, existingPilotId: event.target.value } : prev)} className="ui-input">
                            <option value="">렌탈회원 선택</option>
                            {rentalPilots.map((item) => <option key={getPilotId(item)} value={getPilotId(item)}>{pilotLabel(item)}</option>)}
                          </select>
                        </label>
                      ) : null}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">면장/자격</span>
                          <input value={approvalForm.licenseType} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, licenseType: event.target.value } : prev)} className="ui-input" placeholder="예: ULA" />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">면장번호</span>
                          <input value={approvalForm.licenseNo} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, licenseNo: event.target.value } : prev)} className="ui-input" placeholder="선택 입력" />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="rounded-3xl border border-[#dbe5f1] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[15px] font-medium text-[#10213f]">배정 항공기</div>
                        <p className="mt-1 text-[12px] font-normal text-[#6f8199]">앱 예약 화면에는 여기서 배정한 항공기만 표시됩니다.</p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-[12px] font-medium text-blue-700">{approvalForm.assignedAircraftIds.length}대 선택</span>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {activeAircraft.length === 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] font-normal text-amber-700">등록된 활성 항공기가 없습니다.</div>
                      ) : activeAircraft.map((item) => {
                        const id = getAircraftId(item);
                        const checked = approvalForm.assignedAircraftIds.includes(id);
                        return (
                          <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[13px] transition ${checked ? "border-blue-200 bg-blue-50 text-blue-700" : "border-[#dbe5f1] bg-[#f8fbff] text-[#243b63] hover:bg-white"}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => setApprovalForm((prev) => {
                                if (!prev) return prev;
                                const next = event.target.checked ? [...prev.assignedAircraftIds, id] : prev.assignedAircraftIds.filter((itemId) => itemId !== id);
                                return { ...prev, assignedAircraftIds: Array.from(new Set(next)) };
                              })}
                            />
                            <span>{aircraftLabel(item)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">승인/프로필 메모</span>
                    <textarea value={approvalForm.profileMemo} onChange={(event) => setApprovalForm((prev) => prev ? { ...prev, profileMemo: event.target.value } : prev)} className="ui-input min-h-[110px] resize-y py-3" placeholder="관리자 메모" />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">이름</span>
                    <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className="ui-input" />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">전화번호</span>
                      <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value.replace(/\D/g, "") }))} className="ui-input" placeholder="01000000000" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">이메일</span>
                      <input value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} className="ui-input" />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">역할</span>
                      <select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))} className="ui-input">
                        {ROLE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">상태</span>
                      <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} className="ui-input">
                        {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-[#526a89]">메모</span>
                    <textarea value={form.memo} onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))} className="ui-input min-h-[140px] resize-y py-3" placeholder="관리자 메모" />
                  </label>
                </div>
              )}
            </div>

            <div className="border-t border-[#dbe5f1] bg-[#f8fbff] px-6 py-4">
              {drawerMode === "detail" ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={closeDrawer} className="ui-btn border border-[#dbe5f1] bg-white px-4 text-[#243b63] hover:bg-[#f4f8fd]">닫기</button>
                  {isPending(selectedUser.status) ? (
                    <>
                      <button type="button" onClick={() => openApproval(selectedUser)} className="ui-btn bg-emerald-600 px-4 text-white hover:bg-emerald-700">승인 처리</button>
                      <button type="button" onClick={() => void rejectUser(selectedUser)} className="ui-btn bg-rose-600 px-4 text-white hover:bg-rose-700">반려</button>
                    </>
                  ) : normalizeStatus(selectedUser.status) === "반려" ? (
                    <button type="button" onClick={() => openApproval(selectedUser)} className="ui-btn border border-[#dbe5f1] bg-white px-4 text-[#243b63] hover:bg-[#f4f8fd]">재승인</button>
                  ) : (
                    <button type="button" onClick={() => setDrawerMode("edit")} className="ui-btn ui-btn-primary px-4">수정</button>
                  )}
                </div>
              ) : drawerMode === "approval" ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={closeDrawer} className="ui-btn border border-[#dbe5f1] bg-white px-4 text-[#243b63] hover:bg-[#f4f8fd]">취소</button>
                  <button type="button" disabled={savingId === getUserId(selectedUser)} onClick={() => void approveWithProfile()} className="ui-btn bg-emerald-600 px-5 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {savingId === getUserId(selectedUser) ? "승인 중" : "연결/생성 후 승인"}
                  </button>
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

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";
import { formatKstDate as sharedFormatKstDate } from "@/lib/formatDateTime";

type Row = Record<string, unknown>;

type ApiResult = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  trainingCharges?: Row[];
  students?: Row[];
};

type ChargeForm = {
  chargeId: string;
  studentId: string;
  studentName: string;
  chargeDate: string;
  chargeType: string;
  chargeHours: string;
  usedHours: string;
  amount: string;
  paidAmount: string;
  paymentStatus: string;
  memo: string;
};

const defaultChargeHours = "20";

const emptyForm: ChargeForm = {
  chargeId: "",
  studentId: "",
  studentName: "",
  chargeDate: todayText(),
  chargeType: "20시간 교육시간 충전",
  chargeHours: defaultChargeHours,
  usedHours: "0",
  amount: "",
  paidAmount: "",
  paymentStatus: "미결제",
  memo: "",
};

function todayText() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function dateText(value: unknown) {
  const valueText = sharedFormatKstDate(value);
  return valueText === "-" ? "" : valueText;
}

function numberValue(value: unknown) {
  const n = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hourValue(value: unknown) {
  const n = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function minutesFromHours(value: unknown) {
  return Math.round(hourValue(value) * 60);
}

function hoursFromMinutes(value: unknown) {
  return Math.round((numberValue(value) / 60) * 10) / 10;
}

function rowChargedMinutes(row: Row) {
  return numberValue(row.chargedMinutes || row.chargeMinutes) || minutesFromHours(row.chargeHours || row.hours || row.creditHours);
}

function rowUsedMinutes(row: Row) {
  return numberValue(row.usedMinutes || row.usedTrainingMinutes) || minutesFromHours(row.usedHours);
}

function rowRemainingMinutes(row: Row) {
  const explicit = numberValue(row.remainingMinutes || row.remainingTrainingMinutes);
  if (explicit > 0) return explicit;
  return Math.max(rowChargedMinutes(row) - rowUsedMinutes(row), 0);
}

function formatMinutes(value: unknown) {
  const minutes = numberValue(value);
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (Number.isInteger(hours)) return `${hours}시간`;
  return `${hours.toFixed(1)}시간`;
}

function formatHour(value: unknown) {
  const n = hourValue(value);
  if (Number.isInteger(n)) return `${n}시간`;
  return `${n.toFixed(1)}시간`;
}

function money(value: unknown) {
  return numberValue(value).toLocaleString("ko-KR") + "원";
}

function remainingHours(row: Row) {
  return hoursFromMinutes(rowRemainingMinutes(row));
}

function unpaid(row: Row) {
  return Math.max(numberValue(row.amount) - numberValue(row.paidAmount), 0);
}

function hourlyRate(row: Row) {
  const hours = hourValue(row.chargeHours || row.hours || row.creditHours);
  if (!hours) return 0;
  return Math.round(numberValue(row.amount) / hours);
}

function badgeClass(status: unknown) {
  const s = text(status).replace(/\s/g, "");

  if (["결제완료", "완납"].includes(s)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["부분결제", "부분납"].includes(s)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (["환불"].includes(s)) return "bg-violet-50 text-violet-700 border-violet-200";
  if (["미결제", "미납"].includes(s)) return "bg-rose-50 text-rose-700 border-rose-200";

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function toForm(row: Row): ChargeForm {
  return {
    chargeId: text(row.chargeId),
    studentId: text(row.studentId),
    studentName: text(row.studentName || row.name),
    chargeDate: dateText(row.chargeDate || row.date) || todayText(),
    chargeType: text(row.chargeType || "20시간 교육시간 충전"),
    chargeHours: text(row.chargeHours || row.hours || row.creditHours || defaultChargeHours),
    usedHours: text(row.usedHours || "0"),
    amount: text(row.amount),
    paidAmount: text(row.paidAmount),
    paymentStatus: text(row.paymentStatus || "미결제"),
    memo: text(row.memo),
  };
}

function makePayload(form: ChargeForm) {
  const chargeHours = hourValue(form.chargeHours);
  const usedHours = hourValue(form.usedHours);
  const amount = numberValue(form.amount);
  const paidAmount = numberValue(form.paidAmount);
  const remain = Math.max(chargeHours - usedHours, 0);

  const chargedMinutes = Math.round(chargeHours * 60);
  const usedMinutes = Math.round(usedHours * 60);
  const remainingMinutes = Math.max(chargedMinutes - usedMinutes, 0);

  return {
    ...form,
    chargedMinutes,
    chargeMinutes: chargedMinutes,
    chargeHours,
    usedMinutes,
    usedTrainingMinutes: usedMinutes,
    usedHours,
    remainingMinutes,
    remainingTrainingMinutes: remainingMinutes,
    remainingHours: remain,
    amount,
    paidAmount,
    unpaidAmount: Math.max(amount - paidAmount, 0),
    hourlyRate: chargeHours > 0 ? Math.round(amount / chargeHours) : 0,
    chargeType: text(form.chargeType) || `${chargeHours || 20}시간 교육시간 충전`,
  };
}

function statusFromPayment(amount: string, paidAmount: string, currentStatus: string) {
  const amountNumber = numberValue(amount);
  const paidNumber = numberValue(paidAmount);

  if (amountNumber > 0 && paidNumber >= amountNumber) return "결제완료";
  if (paidNumber > 0 && paidNumber < amountNumber) return "부분결제";
  return currentStatus || "미결제";
}

function SummaryCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string | number;
  sub?: string;
  tone: string;
}) {
  return (
    <ContentCard className="p-5">
      <div className="flex items-center gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 6v12" />
            <path d="M6 12h12" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-black text-[#36506d]">{title}</div>
          <div className="mt-1 text-[24px] font-black leading-none text-[#10213f]">{value}</div>
          {sub ? <div className="mt-1 text-xs font-bold text-[#6f8199]">{sub}</div> : null}
        </div>
      </div>
    </ContentCard>
  );
}

function StudentBalanceCard({
  row,
}: {
  row: {
    studentId: string;
    studentName: string;
    charged: number;
    used: number;
    remaining: number;
    amount: number;
    paid: number;
    unpaid: number;
  };
}) {
  return (
    <div className="rounded-2xl border border-[#dbe5f1] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-[#10213f]">{row.studentName || "-"}</div>
          <div className="mt-1 text-xs font-bold text-[#6f8199]">{row.studentId || "-"}</div>
        </div>
        <span className={`ui-badge ${row.remaining > 5 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          잔여 {formatHour(row.remaining)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[#f4f8fd] px-2 py-2">
          <div className="text-[11px] font-bold text-[#6f8199]">충전</div>
          <div className="mt-1 font-black text-[#10213f]">{formatHour(row.charged)}</div>
        </div>
        <div className="rounded-xl bg-[#f4f8fd] px-2 py-2">
          <div className="text-[11px] font-bold text-[#6f8199]">사용</div>
          <div className="mt-1 font-black text-[#10213f]">{formatHour(row.used)}</div>
        </div>
        <div className="rounded-xl bg-[#f4f8fd] px-2 py-2">
          <div className="text-[11px] font-bold text-[#6f8199]">미납</div>
          <div className={`mt-1 font-black ${row.unpaid > 0 ? "text-rose-700" : "text-[#10213f]"}`}>{money(row.unpaid)}</div>
        </div>
      </div>
    </div>
  );
}

export default function TrainingChargesPage() {
  const [charges, setCharges] = useState<Row[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [form, setForm] = useState<ChargeForm>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/training-charges", { cache: "no-store" });
      const rawText = await response.text();

      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      const data = JSON.parse(rawText) as ApiResult;

      if (!response.ok || data.ok === false || data.success === false) {
        throw new Error(data.message || "교육비 데이터를 불러오지 못했습니다.");
      }

      setCharges(Array.isArray(data.trainingCharges) ? data.trainingCharges : []);
      setStudents(Array.isArray(data.students) ? data.students : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "교육비 데이터를 불러오지 못했습니다.");
      setCharges([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return charges
      .filter((row) => {
        if (statusFilter !== "전체" && text(row.paymentStatus) !== statusFilter) return false;

        if (!q) return true;

        return [
          row.chargeId,
          row.studentName,
          row.name,
          row.chargeType,
          row.paymentStatus,
          row.memo,
        ]
          .map((value) => text(value).toLowerCase())
          .join(" ")
          .includes(q);
      })
      .sort((a, b) => dateText(b.chargeDate || b.date).localeCompare(dateText(a.chargeDate || a.date)));
  }, [charges, keyword, statusFilter]);

  const statusOptions = useMemo(
    () => [
      "전체",
      ...Array.from(
        new Set([
          "미결제",
          "부분결제",
          "결제완료",
          "환불",
          ...charges.map((row) => text(row.paymentStatus)).filter(Boolean),
        ]),
      ),
    ],
    [charges],
  );

  const totalAmount = filtered.reduce((sum, row) => sum + numberValue(row.amount), 0);
  const paidAmount = filtered.reduce((sum, row) => sum + numberValue(row.paidAmount), 0);
  const unpaidAmount = filtered.reduce((sum, row) => sum + unpaid(row), 0);
  const totalChargedHours = filtered.reduce((sum, row) => sum + hoursFromMinutes(rowChargedMinutes(row)), 0);
  const totalUsedHours = filtered.reduce((sum, row) => sum + hoursFromMinutes(rowUsedMinutes(row)), 0);
  const totalRemainingHours = Math.max(totalChargedHours - totalUsedHours, 0);

  const studentBalances = useMemo(() => {
    const map = new Map<string, {
      studentId: string;
      studentName: string;
      charged: number;
      used: number;
      remaining: number;
      amount: number;
      paid: number;
      unpaid: number;
    }>();

    charges.forEach((row) => {
      const studentId = text(row.studentId) || text(row.studentName || row.name);
      if (!studentId) return;

      const current = map.get(studentId) || {
        studentId,
        studentName: text(row.studentName || row.name),
        charged: 0,
        used: 0,
        remaining: 0,
        amount: 0,
        paid: 0,
        unpaid: 0,
      };

      current.charged += hoursFromMinutes(rowChargedMinutes(row));
      current.used += hoursFromMinutes(rowUsedMinutes(row));
      current.remaining = Math.max(current.charged - current.used, 0);
      current.amount += numberValue(row.amount);
      current.paid += numberValue(row.paidAmount);
      current.unpaid += unpaid(row);

      map.set(studentId, current);
    });

    return Array.from(map.values()).sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));
  }, [charges]);

  function update(key: keyof ChargeForm, value: string) {
    setForm((prev) => {
      if (key === "amount" || key === "paidAmount") {
        const next = { ...prev, [key]: value };
        return {
          ...next,
          paymentStatus: statusFromPayment(next.amount, next.paidAmount, next.paymentStatus),
        };
      }

      if (key === "chargeHours") {
        return {
          ...prev,
          chargeHours: value,
          chargeType: `${value || defaultChargeHours}시간 교육시간 충전`,
        };
      }

      return { ...prev, [key]: value };
    });
  }

  function selectStudent(studentId: string) {
    const row = students.find((student) => text(student.studentId) === studentId);

    setForm((prev) => ({
      ...prev,
      studentId,
      studentName: row ? text(row.name || row.studentName) : "",
    }));
  }

  function quickCharge(hours: number) {
    setForm((prev) => ({
      ...prev,
      chargeHours: String(hours),
      chargeType: `${hours}시간 교육시간 충전`,
    }));
  }

  function startEdit(row: Row) {
    setForm(toForm(row));
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setForm({ ...emptyForm, chargeDate: todayText() });
    setEditing(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = makePayload(form);

      const response = await fetch("/api/training-charges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: editing ? "update" : "add",
          data: payload,
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      const data = JSON.parse(rawText) as ApiResult;

      if (!response.ok || data.ok === false || data.success === false) {
        throw new Error(data.message || "교육비를 저장하지 못했습니다.");
      }

      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "교육비를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer title="교육비관리" description="20시간 단위 교육시간 충전, 사용시간, 잔여시간, 납부 상태를 함께 관리합니다.">
      <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
        <SummaryCard title="충전시간" value={formatHour(totalChargedHours)} sub={`${filtered.length}건 기준`} tone="bg-blue-50 text-blue-600" />
        <SummaryCard title="사용시간" value={formatHour(totalUsedHours)} tone="bg-violet-50 text-violet-600" />
        <SummaryCard title="잔여시간" value={formatHour(totalRemainingHours)} tone="bg-emerald-50 text-emerald-600" />
        <SummaryCard title="납부액" value={money(paidAmount)} tone="bg-cyan-50 text-cyan-600" />
        <SummaryCard title="미납액" value={money(unpaidAmount)} tone="bg-rose-50 text-rose-600" />
      </div>

      <ContentCard className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-black text-[#10213f]">{editing ? "교육시간 충전 내역 수정" : "교육시간 충전 등록"}</h2>
            <p className="mt-1 text-sm font-bold text-[#6f8199]">
              교육생이 20시간 단위로 결제한 시간을 충전하고, 사용시간과 잔여시간을 관리합니다.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => quickCharge(20)} className="ui-btn ui-btn-outline">20시간 충전</button>
            <button type="button" onClick={reset} className="ui-btn ui-btn-outline">신규 입력</button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={save} className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
          <label className="ui-label">
            <span>교육생</span>
            <select className="ui-input" value={form.studentId} onChange={(event) => selectStudent(event.target.value)}>
              <option value="">선택 안 함</option>
              {students.map((student, index) => (
                <option key={`${text(student.studentId)}-${index}`} value={text(student.studentId)}>
                  {text(student.name || student.studentName)} / {text(student.studentId)}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-label">
            <span>충전일</span>
            <input type="date" className="ui-input" value={form.chargeDate} onChange={(event) => update("chargeDate", event.target.value)} />
          </label>

          <label className="ui-label">
            <span>충전 구분</span>
            <input className="ui-input" value={form.chargeType} onChange={(event) => update("chargeType", event.target.value)} placeholder="20시간 교육시간 충전" />
          </label>

          <label className="ui-label">
            <span>결제 상태</span>
            <select className="ui-input" value={form.paymentStatus} onChange={(event) => update("paymentStatus", event.target.value)}>
              <option>미결제</option>
              <option>부분결제</option>
              <option>결제완료</option>
              <option>환불</option>
            </select>
          </label>

          <label className="ui-label">
            <span>충전시간</span>
            <input className="ui-input" value={form.chargeHours} onChange={(event) => update("chargeHours", event.target.value)} placeholder="20" />
          </label>

          <label className="ui-label">
            <span>사용시간</span>
            <input className="ui-input" value={form.usedHours} onChange={(event) => update("usedHours", event.target.value)} placeholder="0" />
          </label>

          <label className="ui-label">
            <span>잔여시간</span>
            <input className="ui-input bg-[#f8fbff]" value={formatHour(Math.max(hourValue(form.chargeHours) - hourValue(form.usedHours), 0))} readOnly />
          </label>

          <label className="ui-label">
            <span>시간당 단가</span>
            <input className="ui-input bg-[#f8fbff]" value={money(hourValue(form.chargeHours) > 0 ? Math.round(numberValue(form.amount) / hourValue(form.chargeHours)) : 0)} readOnly />
          </label>

          <label className="ui-label">
            <span>청구금액</span>
            <input className="ui-input" value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="0" />
          </label>

          <label className="ui-label">
            <span>납부금액</span>
            <input className="ui-input" value={form.paidAmount} onChange={(event) => update("paidAmount", event.target.value)} placeholder="0" />
          </label>

          <label className="ui-label">
            <span>미납금액</span>
            <input className="ui-input bg-[#f8fbff]" value={money(Math.max(numberValue(form.amount) - numberValue(form.paidAmount), 0))} readOnly />
          </label>

          <label className="ui-label">
            <span>충전 ID</span>
            <input className="ui-input bg-[#f8fbff]" value={form.chargeId || "자동 생성"} readOnly />
          </label>

          <label className="ui-label xl:col-span-4">
            <span>메모</span>
            <input className="ui-input" value={form.memo} onChange={(event) => update("memo", event.target.value)} placeholder="예: 1차 20시간 충전, 카드 결제, 분납 등" />
          </label>

          <div className="flex gap-2 xl:col-span-4">
            <button disabled={saving} className="ui-btn ui-btn-primary">
              {saving ? "저장 중" : editing ? "수정 저장" : "충전 등록"}
            </button>
            <button type="button" onClick={reset} className="ui-btn ui-btn-outline">
              초기화
            </button>
          </div>
        </form>
      </ContentCard>

      <ContentCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-black text-[#10213f]">교육생별 잔여시간</h2>
            <p className="mt-1 text-sm font-bold text-[#6f8199]">충전시간에서 사용시간을 뺀 잔여시간을 교육생별로 확인합니다.</p>
          </div>
          <span className="ui-badge border-[#dbe5f1] bg-[#f4f8fd] text-[#526a89]">
            {studentBalances.length}명
          </span>
        </div>

        {studentBalances.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-8 text-center text-sm font-bold text-[#6f8199]">
            아직 충전 내역이 없습니다.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-3 md:grid-cols-2">
            {studentBalances.map((row) => (
              <StudentBalanceCard key={row.studentId} row={row} />
            ))}
          </div>
        )}
      </ContentCard>

      <ContentCard className="p-5">
        <div className="grid gap-3 xl:grid-cols-[220px_minmax(320px,1fr)] md:grid-cols-2">
          <select className="ui-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {statusOptions.map((status) => (
              <option key={status}>{status === "전체" ? "결제 상태 전체" : status}</option>
            ))}
          </select>
          <input
            className="ui-input"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="교육생, 충전 구분, 상태, 메모 검색"
          />
        </div>
      </ContentCard>

      <ContentCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-[18px] font-black text-[#10213f]">교육시간 충전 내역</h2>
          <span className="ui-badge border-[#dbe5f1] bg-[#f4f8fd] text-[#526a89]">표시 {filtered.length}건</span>
        </div>

        <div className="overflow-x-auto px-6 pb-6">
          <table className="ui-table min-w-[1240px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead>
              <tr>
                <th>충전일</th>
                <th>교육생</th>
                <th>구분</th>
                <th>충전시간</th>
                <th>사용시간</th>
                <th>잔여시간</th>
                <th>청구금액</th>
                <th>납부금액</th>
                <th>미납액</th>
                <th>시간당 단가</th>
                <th>상태</th>
                <th>메모</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} className="text-center text-[#6f8199]">불러오는 중입니다.</td>
                </tr>
              ) : null}

              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center text-[#6f8199]">표시할 내역이 없습니다.</td>
                </tr>
              ) : null}

              {!loading && filtered.map((row, index) => (
                <tr key={`${text(row.chargeId)}-${index}`}>
                  <td>{dateText(row.chargeDate || row.date)}</td>
                  <td>
                    <div className="font-black text-[#10213f]">{text(row.studentName || row.name, "-")}</div>
                    <div className="mt-1 text-xs font-bold text-[#6f8199]">{text(row.studentId, "-")}</div>
                  </td>
                  <td>{text(row.chargeType, "-")}</td>
                  <td>{formatMinutes(rowChargedMinutes(row))}</td>
                  <td>{formatMinutes(rowUsedMinutes(row))}</td>
                  <td className={remainingHours(row) <= 5 ? "font-black text-amber-700" : "font-black text-emerald-700" }>{formatMinutes(rowRemainingMinutes(row))}</td>
                  <td>{money(row.amount)}</td>
                  <td>{money(row.paidAmount)}</td>
                  <td className={unpaid(row) > 0 ? "font-black text-rose-700" : ""}>{money(unpaid(row))}</td>
                  <td>{money(hourlyRate(row))}</td>
                  <td><span className={`ui-badge ${badgeClass(row.paymentStatus)}`}>{text(row.paymentStatus, "-")}</span></td>
                  <td className="max-w-[220px] truncate">{text(row.memo, "-")}</td>
                  <td className="text-right">
                    <button type="button" className="ui-btn ui-btn-outline" onClick={() => startEdit(row)}>수정</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}

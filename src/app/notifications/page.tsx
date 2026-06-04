"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatKstDate, formatKstDateTime, formatKstTime } from "@/lib/formatDateTime";

type TrainingChargeRow = {
  chargeId?: string;
  studentId?: string;
  studentName?: string;
  chargeDate?: string;
  chargeType?: string;
  amount?: string | number;
  paidAmount?: string | number;
  paymentStatus?: string;
  paymentDate?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type StudentRow = {
  studentId?: string;
  name?: string;
  phone?: string;
  trainingStatus?: string;
  [key: string]: unknown;
};

type TrainingChargeForm = {
  chargeId: string;
  studentId: string;
  studentName: string;
  chargeDate: string;
  chargeType: string;
  amount: string;
  paidAmount: string;
  paymentStatus: string;
  paymentDate: string;
  memo: string;
};

const emptyForm: TrainingChargeForm = {
  chargeId: "",
  studentId: "",
  studentName: "",
  chargeDate: "",
  chargeType: "교육비",
  amount: "",
  paidAmount: "",
  paymentStatus: "미납",
  paymentDate: "",
  memo: "",
};

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function numberValue(value: unknown) {
  const number = Number(String(value || "0").replace(/,/g, ""));

  if (Number.isNaN(number)) {
    return 0;
  }

  return number;
}

function formatMoney(value: unknown) {
  const number = numberValue(value);

  return new Intl.NumberFormat("ko-KR").format(number);
}

function calculatePaymentStatus(amount: string, paidAmount: string) {
  const targetAmount = numberValue(amount);
  const targetPaidAmount = numberValue(paidAmount);

  if (targetPaidAmount <= 0) {
    return "미납";
  }

  if (targetAmount > 0 && targetPaidAmount >= targetAmount) {
    return "완납";
  }

  return "부분납";
}

function toForm(row: TrainingChargeRow): TrainingChargeForm {
  return {
    chargeId: formValue(row.chargeId),
    studentId: formValue(row.studentId),
    studentName: formValue(row.studentName),
    chargeDate: formValue(row.chargeDate),
    chargeType: formValue(row.chargeType || "교육비"),
    amount: formValue(row.amount),
    paidAmount: formValue(row.paidAmount),
    paymentStatus: formValue(row.paymentStatus || "미납"),
    paymentDate: formValue(row.paymentDate),
    memo: formValue(row.memo),
  };
}

function getPaymentStatusBadgeClass(status: unknown) {
  const value = text(status, "");

  if (value === "완납") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (value === "부분납") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (value === "미납") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-50 text-slate-700 ring-slate-200";
}

export default function TrainingChargesPage() {
  const [charges, setCharges] = useState<TrainingChargeRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [chargeTypeFilter, setChargeTypeFilter] = useState("전체");
  const [error, setError] = useState("");

  const [form, setForm] = useState<TrainingChargeForm>(emptyForm);
  const [editing, setEditing] = useState(false);

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      setError("");

      const response = await fetch("/api/training-charges", {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: {
        ok?: boolean;
        message?: string;
        trainingCharges?: TrainingChargeRow[];
        students?: StudentRow[];
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "교육비 데이터를 불러오지 못했습니다.");
      }

      setCharges(Array.isArray(data.trainingCharges) ? data.trainingCharges : []);
      setStudents(Array.isArray(data.students) ? data.students : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "교육비 데이터를 불러오지 못했습니다."
      );
      setCharges([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(false);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadData]);

  const chargeTypes = useMemo(() => {
    const values = charges
      .map((item) => text(item.chargeType, ""))
      .filter((item) => item !== "");

    return ["전체", ...Array.from(new Set(values))];
  }, [charges]);

  const paymentStatuses = useMemo(() => {
    const values = charges
      .map((item) => text(item.paymentStatus, ""))
      .filter((item) => item !== "");

    return ["전체", ...Array.from(new Set(values))];
  }, [charges]);

  const filteredCharges = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return charges.filter((item) => {
      if (
        statusFilter !== "전체" &&
        text(item.paymentStatus, "") !== statusFilter
      ) {
        return false;
      }

      if (
        chargeTypeFilter !== "전체" &&
        text(item.chargeType, "") !== chargeTypeFilter
      ) {
        return false;
      }

      if (!q) {
        return true;
      }

      const searchText = [
        item.chargeId,
        item.studentId,
        item.studentName,
        item.chargeDate,
        item.chargeType,
        item.amount,
        item.paidAmount,
        item.paymentStatus,
        item.paymentDate,
        item.memo,
      ]
        .map((value) => text(value, ""))
        .join(" ")
        .toLowerCase();

      return searchText.includes(q);
    });
  }, [charges, keyword, statusFilter, chargeTypeFilter]);

  const totalAmount = charges.reduce(
    (sum, item) => sum + numberValue(item.amount),
    0
  );

  const totalPaidAmount = charges.reduce(
    (sum, item) => sum + numberValue(item.paidAmount),
    0
  );

  const unpaidAmount = Math.max(totalAmount - totalPaidAmount, 0);

  const unpaidCount = charges.filter(
    (item) => text(item.paymentStatus, "") === "미납"
  ).length;

  function updateForm(key: keyof TrainingChargeForm, value: string) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "amount" || key === "paidAmount") {
        next.paymentStatus = calculatePaymentStatus(next.amount, next.paidAmount);
      }

      return next;
    });
  }

  function startCreate() {
    setForm(emptyForm);
    setEditing(false);
  }

  function startEdit(row: TrainingChargeRow) {
    setForm(toForm(row));
    setEditing(true);
  }

  function selectStudent(studentId: string) {
    const selected = students.find(
      (item) => text(item.studentId, "") === studentId
    );

    setForm((prev) => ({
      ...prev,
      studentId,
      studentName: selected ? text(selected.name, "") : "",
    }));
  }

  function markFullPayment() {
    setForm((prev) => ({
      ...prev,
      paidAmount: prev.amount,
      paymentStatus: "완납",
      paymentDate: prev.paymentDate || new Date().toISOString().slice(0, 10),
    }));
  }

  async function saveCharge() {
    try {
      if (!form.studentId) {
        alert("교육생을 선택하세요.");
        return;
      }

      if (!form.chargeDate) {
        alert("청구일을 입력하세요.");
        return;
      }

      if (numberValue(form.amount) <= 0) {
        alert("청구금액을 입력하세요.");
        return;
      }

      setSaving(true);

      const response = await fetch("/api/training-charges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: editing ? "update" : "add",
          data: form,
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: {
        ok?: boolean;
        message?: string;
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "교육비 저장에 실패했습니다.");
      }

      await loadData(true);
      setForm(emptyForm);
      setEditing(false);
      alert(
        editing
          ? "교육비 청구 내역이 수정되었습니다."
          : "교육비 청구 내역이 등록되었습니다."
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "교육비 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="flex w-full flex-col gap-6 p-6">
        <section className="flex flex-row items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-500">관리자 기능</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              교육비관리
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              교육생별 교육비 청구, 납부금액, 납부상태를 등록하고 수정합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData(true)}
            className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
          >
            {loading ? "불러오는 중" : "새로고침"}
          </button>
        </section>

        <section className="grid grid-cols-4 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">총 청구금액</p>
            <p className="mt-3 text-3xl font-black text-slate-950">
              {formatMoney(totalAmount)}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">총 납부금액</p>
            <p className="mt-3 text-3xl font-black text-emerald-700">
              {formatMoney(totalPaidAmount)}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">미수금</p>
            <p className="mt-3 text-3xl font-black text-rose-700">
              {formatMoney(unpaidAmount)}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">미납 건수</p>
            <p className="mt-3 text-3xl font-black text-amber-700">
              {unpaidCount}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {editing ? "교육비 내역 수정" : "교육비 신규 청구"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                교육생, 청구유형, 금액, 납부상태를 입력합니다.
              </p>
            </div>

            <button
              type="button"
              onClick={startCreate}
              className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              신규 입력
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500">청구 ID</label>
              <input
                value={form.chargeId}
                disabled
                placeholder="자동 생성"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">교육생</label>
              <select
                value={form.studentId}
                onChange={(event) => selectStudent(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">선택 안 함</option>
                {students.map((item, index) => {
                  const studentId = text(item.studentId, "");
                  const name = text(item.name, "");

                  return (
                    <option key={`${studentId}-${index}`} value={studentId}>
                      {name} / {studentId}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">청구일</label>
              <input
                type="date"
                value={form.chargeDate}
                onChange={(event) => updateForm("chargeDate", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">청구유형</label>
              <select
                value={form.chargeType}
                onChange={(event) => updateForm("chargeType", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="교육비">교육비</option>
                <option value="비행비">비행비</option>
                <option value="이론교육비">이론교육비</option>
                <option value="렌탈비">렌탈비</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">청구금액</label>
              <input
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                placeholder="예: 500000"
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">납부금액</label>
              <input
                value={form.paidAmount}
                onChange={(event) => updateForm("paidAmount", event.target.value)}
                placeholder="예: 300000"
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">납부상태</label>
              <select
                value={form.paymentStatus}
                onChange={(event) =>
                  updateForm("paymentStatus", event.target.value)
                }
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="미납">미납</option>
                <option value="부분납">부분납</option>
                <option value="완납">완납</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">납부일</label>
              <input
                type="date"
                value={form.paymentDate}
                onChange={(event) => updateForm("paymentDate", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="col-span-4">
              <label className="text-xs font-bold text-slate-500">메모</label>
              <textarea
                value={form.memo}
                onChange={(event) => updateForm("memo", event.target.value)}
                rows={3}
                placeholder="청구 또는 납부 관련 메모"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-between gap-2">
            <button
              type="button"
              onClick={markFullPayment}
              className="h-11 rounded-xl border border-emerald-300 bg-emerald-50 px-5 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
            >
              완납 처리
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={startCreate}
                className="h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-100"
              >
                초기화
              </button>

              <button
                type="button"
                onClick={() => void saveCharge()}
                disabled={saving}
                className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "저장 중" : editing ? "수정 저장" : "신규 등록"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-[220px_220px_minmax(0,1fr)] gap-3">
            <select
              value={chargeTypeFilter}
              onChange={(event) => setChargeTypeFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              {chargeTypes.map((item) => (
                <option key={item} value={item}>
                  {item === "전체" ? "전체 청구유형" : item}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              {paymentStatuses.map((item) => (
                <option key={item} value={item}>
                  {item === "전체" ? "전체 납부상태" : item}
                </option>
              ))}
            </select>

            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="교육생, 청구유형, 납부상태, 메모 검색"
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </section>

        {error && (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
            {error}
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-bold text-slate-950">교육비 목록</h2>
              <p className="mt-1 text-sm text-slate-500">
                trainingCharges 시트 기준으로 표시됩니다.
              </p>
            </div>

            <p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
              표시 {filteredCharges.length}건
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm font-medium text-slate-500">
              교육비 데이터를 불러오는 중입니다.
            </div>
          ) : filteredCharges.length === 0 ? (
            <div className="p-12 text-center text-sm font-medium text-slate-500">
              표시할 교육비 내역이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">청구일</th>
                    <th className="px-6 py-4">교육생</th>
                    <th className="px-6 py-4">청구유형</th>
                    <th className="px-6 py-4">금액</th>
                    <th className="px-6 py-4">납부상태</th>
                    <th className="px-6 py-4">납부일</th>
                    <th className="px-6 py-4">메모</th>
                    <th className="px-6 py-4 text-right">관리</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredCharges.map((item, index) => (
                    <tr
                      key={`${text(item.chargeId, "charge")}-${index}`}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="px-6 py-5">
                        <div className="font-bold text-slate-900">
                          {formatKstDate(item.chargeDate)}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {text(item.chargeId)}
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <div className="font-bold text-slate-900">
                          {text(item.studentName)}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {text(item.studentId)}
                        </div>
                      </td>

                      <td className="px-6 py-5 text-slate-600">
                        {text(item.chargeType)}
                      </td>

                      <td className="px-6 py-5 text-slate-600">
                        <div className="font-bold text-slate-900">
                          청구 {formatMoney(item.amount)}원
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          납부 {formatMoney(item.paidAmount)}원
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${getPaymentStatusBadgeClass(
                            item.paymentStatus
                          )}`}
                        >
                          {text(item.paymentStatus)}
                        </span>
                      </td>

                      <td className="px-6 py-5 text-slate-600">
                        {text(item.paymentDate)}
                      </td>

                      <td className="max-w-md px-6 py-5 text-slate-600">
                        {text(item.memo)}
                      </td>

                      <td className="px-6 py-5 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="h-9 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-slate-800"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

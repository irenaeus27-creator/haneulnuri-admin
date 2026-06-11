"use client";

import { formatPhone, formatAircraft } from "@/lib/display-formatters";

import { useEffect, useMemo, useState } from "react";
import { formatKstDate, formatKstDateTime } from "@/lib/formatDateTime";

type Row = Record<string, string | number | boolean | null | undefined>;

type SheetResult = {
  ok?: boolean;
  rows?: Row[];
};

type PaymentFilter = "전체" | "미납" | "부분납" | "완납" | "미결제";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return `${value.toLocaleString()}원`;
}

async function fetchSheet(sheet: string): Promise<Row[]> {
  const response = await fetch(`/api/sheets?sheet=${encodeURIComponent(sheet)}`, {
    cache: "no-store",
  });
  const data = (await response.json()) as SheetResult;
  if (!response.ok || data.ok === false) return [];
  return Array.isArray(data.rows) ? data.rows : [];
}

function normalizedStatus(row: Row) {
  const status = text(row.paymentStatus);
  if (status) return status;
  const amount = money(row.amount);
  const paid = money(row.paidAmount);
  if (paid <= 0) return "미납";
  if (amount > 0 && paid >= amount) return "완납";
  return "부분납";
}

export default function TrainingSettlementPage() {
  const [students, setStudents] = useState<Row[]>([]);
  const [charges, setCharges] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<PaymentFilter>("전체");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [studentRows, chargeRows] = await Promise.all([
        fetchSheet("students"),
        fetchSheet("trainingCharges"),
      ]);
      setStudents(studentRows);
      setCharges(chargeRows);
      setLoading(false);
    }

    load();
  }, []);

  const settlementRows = useMemo(() => {
    const knownStudents = students.map((student) => {
      const studentId = text(student.studentId);
      const name = text(student.name || student.studentName);
      const relatedCharges = charges.filter((charge) => {
        const chargeStudentId = text(charge.studentId);
        const chargeStudentName = text(charge.studentName);
        return (studentId && chargeStudentId === studentId) || (!studentId && name && chargeStudentName === name);
      });
      return { studentId, name, phone: text(student.phone), charges: relatedCharges };
    });

    const knownKeys = new Set(
      knownStudents.flatMap((student) => [student.studentId, student.name].filter(Boolean))
    );

    const extraStudents = charges
      .filter((charge) => {
        const key = text(charge.studentId) || text(charge.studentName);
        return key && !knownKeys.has(key);
      })
      .reduce<{ studentId: string; name: string; phone: string; charges: Row[] }[]>((list, charge) => {
        const studentId = text(charge.studentId);
        const name = text(charge.studentName);
        const key = studentId || name;
        let item = list.find((row) => (row.studentId || row.name) === key);
        if (!item) {
          item = { studentId, name, phone: text(charge.phone), charges: [] };
          list.push(item);
        }
        item.charges.push(charge);
        return list;
      }, []);

    const mergedStudents = [...knownStudents, ...extraStudents].reduce<typeof knownStudents>((list, student) => {
      const key = student.studentId || student.name;
      const existing = list.find((item) => (item.studentId || item.name) === key);

      if (existing) {
        existing.charges = [...existing.charges, ...student.charges];
        if (!existing.name) existing.name = student.name;
        if (!existing.phone) existing.phone = student.phone;
        return list;
      }

      list.push({ ...student, charges: [...student.charges] });
      return list;
    }, []);

    return mergedStudents.map((student) => {
      const totalAmount = student.charges.reduce((sum, charge) => sum + money(charge.amount), 0);
      const paidAmount = student.charges.reduce((sum, charge) => sum + money(charge.paidAmount), 0);
      const unpaidAmount = Math.max(totalAmount - paidAmount, 0);
      const unpaidCount = student.charges.filter((charge) => {
        const chargeStatus = normalizedStatus(charge);
        return chargeStatus === "미납" || chargeStatus === "부분납" || chargeStatus === "미결제" || money(charge.paidAmount) < money(charge.amount);
      }).length;
      const lastCharge = [...student.charges].sort((a, b) => text(b.chargeDate).localeCompare(text(a.chargeDate)))[0];
      const paymentStatus = unpaidAmount <= 0 && totalAmount > 0 ? "완납" : paidAmount <= 0 ? "미납" : "부분납";

      return {
        ...student,
        rowKey: student.studentId || student.name,
        totalAmount,
        paidAmount,
        unpaidAmount,
        unpaidCount,
        paymentStatus,
        lastChargeDate: lastCharge ? text(lastCharge.chargeDate) : "",
        lastChargeType: lastCharge ? text(lastCharge.chargeType) : "",
      };
    });
  }, [charges, students]);

  const studentFilterOptions = useMemo(() => {
    const seen = new Set<string>();

    return settlementRows.filter((row) => {
      const key = row.studentId || row.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [settlementRows]);

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return settlementRows.filter((row) => {
      const matchesStatus = status === "전체" || row.paymentStatus === status;
      const matchesStudent = !selectedStudentId || row.studentId === selectedStudentId || row.name === selectedStudentId;
      const matchesKeyword = !query || [row.name, row.phone, row.studentId, row.lastChargeType]
        .join(" ")
        .toLowerCase()
        .includes(query);
      return matchesStatus && matchesStudent && matchesKeyword;
    });
  }, [keyword, selectedStudentId, settlementRows, status]);

  const selectedDetails = useMemo(() => {
    if (!selectedStudentId) return [];
    return charges
      .filter((charge) => text(charge.studentId) === selectedStudentId || text(charge.studentName) === selectedStudentId)
      .sort((a, b) => text(b.chargeDate).localeCompare(text(a.chargeDate)));
  }, [charges, selectedStudentId]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (result, row) => {
        result.totalAmount += row.totalAmount;
        result.paidAmount += row.paidAmount;
        result.unpaidAmount += row.unpaidAmount;
        if (row.unpaidAmount > 0) result.unpaidStudents += 1;
        return result;
      },
      { totalAmount: 0, paidAmount: 0, unpaidAmount: 0, unpaidStudents: 0 }
    );
  }, [filteredRows]);

  return (
    <main className="min-h-screen bg-slate-50 px-8 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold text-slate-500">정산관리</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">교육비 상세 정산</h1>
        <p className="mt-2 text-sm text-slate-500">
          교육생별 청구/납부 내역, 미납액, 결제 상태를 한 화면에서 확인합니다.
        </p>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold text-slate-400">총 청구액</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(summary.totalAmount)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold text-slate-400">총 납부액</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">{formatMoney(summary.paidAmount)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold text-slate-400">총 미납액</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{formatMoney(summary.unpaidAmount)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold text-slate-400">미납 교육생</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.unpaidStudents}명</p>
        </div>
      </section>

      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-3 lg:grid-cols-[180px_260px_1fr]">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PaymentFilter)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
          >
            <option value="전체">전체 결제상태</option>
            <option value="미납">미납</option>
            <option value="부분납">부분납</option>
            <option value="미결제">미결제</option>
            <option value="완납">완납</option>
          </select>
          <select
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
          >
            <option value="">전체 교육생</option>
            {studentFilterOptions.map((row, index) => {
              const value = row.studentId || row.name;
              return (
                <option key={`${value || "student"}-${index}`} value={value}>
                  {row.name || row.studentId || "이름 없음"}
                </option>
              );
            })}
          </select>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="교육생, 연락처, 청구 유형 검색"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
          />
        </div>
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">교육생</th>
                <th className="px-4 py-3 text-left">결제 상태</th>
                <th className="px-4 py-3 text-right">청구액</th>
                <th className="px-4 py-3 text-right">납부액</th>
                <th className="px-4 py-3 text-right">미납액</th>
                <th className="px-4 py-3 text-left">미납 건수</th>
                <th className="px-4 py-3 text-left">최근 청구</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">불러오는 중입니다.</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">표시할 정산 내역이 없습니다.</td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={`${row.studentId || row.name || "settlement"}-${index}`} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedStudentId(row.studentId || row.name)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.name || "-"}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatPhone(row.phone) || row.studentId || "-"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.unpaidAmount > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatMoney(row.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{formatMoney(row.paidAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-700">{formatMoney(row.unpaidAmount)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.unpaidCount}건</td>
                    <td className="px-4 py-3 text-slate-600">{formatKstDateTime(row.lastChargeDate)} {row.lastChargeType ? `/ ${row.lastChargeType}` : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedStudentId ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">교육생별 청구/납부 상세</h2>
            <button
              type="button"
              onClick={() => setSelectedStudentId("")}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              상세 닫기
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">청구일</th>
                  <th className="px-4 py-3 text-left">유형</th>
                  <th className="px-4 py-3 text-right">청구액</th>
                  <th className="px-4 py-3 text-right">납부액</th>
                  <th className="px-4 py-3 text-right">미납액</th>
                  <th className="px-4 py-3 text-left">상태</th>
                  <th className="px-4 py-3 text-left">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedDetails.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">상세 내역이 없습니다.</td>
                  </tr>
                ) : (
                  selectedDetails.map((charge) => {
                    const amount = money(charge.amount);
                    const paid = money(charge.paidAmount);
                    const unpaid = Math.max(amount - paid, 0);
                    return (
                      <tr key={text(charge.chargeId) || `${formatKstDateTime(charge.chargeDate)}-${text(charge.chargeType)}`}>
                        <td className="px-4 py-3 text-slate-700">{formatKstDateTime(charge.chargeDate)}</td>
                        <td className="px-4 py-3 text-slate-700">{text(charge.chargeType) || "교육비"}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatMoney(amount)}</td>
                        <td className="px-4 py-3 text-right text-blue-700">{formatMoney(paid)}</td>
                        <td className="px-4 py-3 text-right font-bold text-rose-700">{formatMoney(unpaid)}</td>
                        <td className="px-4 py-3 text-slate-700">{normalizedStatus(charge)}</td>
                        <td className="px-4 py-3 text-slate-500">{text(charge.memo) || "-"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

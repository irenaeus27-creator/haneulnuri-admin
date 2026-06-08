"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";

type SubmitResult = {
  ok?: boolean;
  message?: string;
  consentId?: string;
};

const AGREEMENT_VERSION = "experience-passenger-waiver-v2026-06-07";

const initialForm = {
  passengerName: "",
  birthDate: "",
  address: "",
  phone: "",
  actionCam: "X",
  simulator: "X",
  photoPrint: "X",
  marketingConsent: "X",
  reservationSource: "",
  flightDate: "",
  healthClear: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  bloodType: "",
  signatureName: "",
  understood: false,
  saveConsent: false,
};

const reservationSources = ["네이버", "구글", "유튜브", "인스타그램", "지인추천", "현장방문", "기타"];
const bloodTypes = ["A형 RH+", "A형 RH-", "B형 RH+", "B형 RH-", "AB형 RH+", "AB형 RH-", "O형 RH+", "O형 RH-", "모름/미입력"];

const koreanClauses = [
  "위 본인은 본인의 의사에 따라 하늘누리 비행교육원의 경량항공기에 탑승하고자 한다.",
  "탑승 과정 또는 비행 중 어떠한 사고나 본인의 부주의에 의한 과실로 인하여 발생하는 인적, 물적 사고의 손해배상책임은 전적으로 본인에게 있으므로 하늘누리 비행교육원에 어떠한 민, 형사상의 책임을 묻지 않는다.",
  "만약 사고 발생 시에는 하늘누리 비행교육원을 대신하여 보험회사로부터 지급받는 보험금만으로 손해보전을 받겠으며 하늘누리 비행교육원 측에 대한 어떠한 손해배상청구권도 포기합니다. (다만, 항공기 운행자의 고의 또는 중과실에 의한 사고는 제외함.)",
  "하늘누리 비행교육원에 대한 손해배상청구권은 사고 발생일로부터 1년간 행사하지 아니할 때에는 시효로 인하여 소멸하는 것에 동의합니다.",
  "본인은 관숙(체험)비행을 하는데 지장을 초래할 만한 신체적, 정신적 문제가 없습니다.",
  "본 서약은 어떠한 강요나 착오에 의한 것이 아니고, 본인이 그 내용을 충분히 이해한 후 자유로운 의사에 의한 것임을 확인합니다.",
];

const englishClauses = [
  "I voluntarily choose to board and fly in a light aircraft operated by SKYNURI Flight Education Center.",
  "I acknowledge that I am solely responsible for any personal injury or property damage that may occur due to my own negligence or fault during boarding or flight, and I shall not hold SKYNURI Flight Education Center liable for any civil or criminal responsibility arising therefrom.",
  "In the event of an accident, I agree to receive compensation only through the insurance benefits paid by the insurance company on behalf of SKYNURI Flight Education Center, and I waive any right to claim additional damages from SKYNURI Flight Education Center. However, this does not apply in cases where the aircraft operator’s willful misconduct or gross negligence is proven.",
  "I agree that my right to claim damages against SKYNURI Flight Education Center shall expire if not exercised within one (1) year from the date of the incident.",
  "I confirm that I have no physical or mental conditions that would interfere with my participation in the familiarization experience flight.",
  "I confirm that this agreement is made voluntarily, without any coercion or misunderstanding, and that I fully understand its contents and agree of my own free will.",
];

function todayText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function phoneLinkText(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return value;
}

export default function ExperienceConsentPage() {
  const [form, setForm] = useState({ ...initialForm, flightDate: todayText() });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const canSubmit = useMemo(() => {
    return Boolean(
      text(form.passengerName) &&
        text(form.birthDate) &&
        text(form.phone) &&
        text(form.flightDate) &&
        text(form.healthClear) &&
        text(form.signatureName) &&
        form.understood &&
        form.saveConsent,
    );
  }, [form]);

  function update<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    try {
      setSubmitting(true);
      setResult(null);
      const response = await fetch("/api/experience-consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: phoneLinkText(form.phone),
          emergencyContactPhone: phoneLinkText(form.emergencyContactPhone),
          agreementVersion: AGREEMENT_VERSION,
          agreementText: koreanClauses.join("\n"),
        }),
      });
      const data = (await response.json()) as SubmitResult;
      if (!response.ok || !data.ok) throw new Error(data.message || "서약서 제출에 실패했습니다.");
      setSubmitted(true);
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : "서약서 제출에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#f3f7fc] px-4 py-6 text-slate-900">
        <section className="mx-auto max-w-[520px] rounded-[28px] border border-blue-100 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">✓</div>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">SKYNURI CONSENT</p>
          <h1 className="mt-2 text-center text-2xl font-semibold tracking-[-0.03em] text-slate-950">서약서 제출 완료</h1>
          <p className="mt-3 text-center text-sm leading-6 text-slate-600">
            탑승자 서약서가 정상 제출되었습니다. 대기실 직원에게 제출 완료 화면을 보여주세요.
          </p>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex justify-between gap-4 border-b border-slate-200 pb-2"><span>성명</span><strong>{form.passengerName}</strong></div>
            <div className="flex justify-between gap-4 border-b border-slate-200 py-2"><span>탑승일</span><strong>{form.flightDate}</strong></div>
            <div className="flex justify-between gap-4 pt-2"><span>접수번호</span><strong>{result?.consentId || "접수 완료"}</strong></div>
          </div>
          <button className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/20" onClick={() => window.location.reload()}>
            새 서약서 작성
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f7fc] px-4 py-4 text-slate-900 sm:py-8">
      <form onSubmit={submit} className="mx-auto max-w-[560px] space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="bg-gradient-to-br from-blue-600 to-sky-500 px-5 py-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-100">SKYNURI</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">탑승자 서약서</h1>
            <p className="mt-2 text-sm leading-6 text-blue-50">하늘누리 비행교육원 체험비행 탑승 전 아래 내용을 확인하고 작성해주세요.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            <Field label="성명" required>
              <input value={form.passengerName} onChange={(e) => update("passengerName", e.target.value)} placeholder="홍길동" className="input" />
            </Field>
            <Field label="생년월일" required>
              <input type="date" value={form.birthDate} onChange={(e) => update("birthDate", e.target.value)} className="input" />
            </Field>
            <Field label="전화번호" required>
              <input inputMode="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" className="input" />
            </Field>
            <Field label="탑승일" required>
              <input type="date" value={form.flightDate} onChange={(e) => update("flightDate", e.target.value)} className="input" />
            </Field>
            <div className="col-span-2">
              <Field label="주소">
                <input value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="주소" className="input" />
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">추가상품</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">원하는 상품이 있으면 O를 선택해주세요.</p>
          <div className="mt-4 grid gap-3">
            <OptionToggle label="액션캠 3만원" value={form.actionCam} onChange={(value) => update("actionCam", value)} />
            <OptionToggle label="시뮬레이터 3만원" value={form.simulator} onChange={(value) => update("simulator", value)} />
            <OptionToggle label="사진 인화 1만원" value={form.photoPrint} onChange={(value) => update("photoPrint", value)} />
            <OptionToggle label="마케팅 동의" value={form.marketingConsent} onChange={(value) => update("marketingConsent", value)} />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">예약경로</p>
            <div className="grid grid-cols-2 gap-2">
              {reservationSources.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => update("reservationSource", source)}
                  className={`rounded-2xl border px-3 py-3 text-sm font-medium ${form.reservationSource === source ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {source}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">서약 내용</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">아래 내용을 읽고 확인해주세요.</p>
          <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
            {koreanClauses.map((clause, index) => (
              <p key={clause} className="text-sm leading-6 text-slate-700">
                <span className="mr-1 font-semibold text-slate-950">{index + 1}.</span>{clause}
              </p>
            ))}
          </div>
          <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">English Agreement 보기</summary>
            <div className="mt-3 space-y-3">
              {englishClauses.map((clause, index) => (
                <p key={clause} className="text-sm leading-6 text-slate-600"><span className="mr-1 font-semibold">{index + 1}.</span>{clause}</p>
              ))}
            </div>
          </details>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">건강상태 및 비상연락처</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">관숙(체험)비행에 지장을 초래할 만한 신체적, 정신적 문제가 없습니다.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => update("healthClear", "Yes")} className={`rounded-2xl border px-4 py-4 text-sm font-semibold ${form.healthClear === "Yes" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>Yes</button>
            <button type="button" onClick={() => update("healthClear", "No")} className={`rounded-2xl border px-4 py-4 text-sm font-semibold ${form.healthClear === "No" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-600"}`}>No</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="비상 시 보호자 성명">
              <input value={form.emergencyContactName} onChange={(e) => update("emergencyContactName", e.target.value)} placeholder="보호자 성명" className="input" />
            </Field>
            <Field label="보호자 전화번호">
              <input inputMode="tel" value={form.emergencyContactPhone} onChange={(e) => update("emergencyContactPhone", e.target.value)} placeholder="010-0000-0000" className="input" />
            </Field>
            <div className="col-span-2">
              <Field label="혈액형">
                <select value={form.bloodType} onChange={(e) => update("bloodType", e.target.value)} className="input">
                  <option value="">선택 안 함</option>
                  {bloodTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">확인 및 서명</h2>
          <label className="mt-4 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <input type="checkbox" checked={form.understood} onChange={(e) => update("understood", e.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300" />
            <span>본인은 위 서약서 내용을 충분히 읽고 이해했으며 자유로운 의사로 동의합니다.</span>
          </label>
          <label className="mt-3 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <input type="checkbox" checked={form.saveConsent} onChange={(e) => update("saveConsent", e.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300" />
            <span>서약서 제출 내용이 탑승 확인 및 증빙 목적으로 저장되는 것에 동의합니다.</span>
          </label>
          <Field label="탑승 서약인 서명" required className="mt-4">
            <input value={form.signatureName} onChange={(e) => update("signatureName", e.target.value)} placeholder="성명을 다시 입력하세요" className="input" />
          </Field>
          {result?.message ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{result.message}</p> : null}
          <button disabled={!canSubmit || submitting} className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none" type="submit">
            {submitting ? "제출 중..." : "서약서 제출"}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">필수 항목을 모두 입력하면 제출 버튼이 활성화됩니다.</p>
        </section>
      </form>
      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 13px 14px;
          font-size: 15px;
          color: rgb(15 23 42);
          outline: none;
        }
        .input:focus {
          border-color: rgb(37 99 235);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
      `}</style>
    </main>
  );
}

function Field({ label, children, required = false, className = "" }: { label: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}{required ? <span className="ml-1 text-rose-500">*</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function OptionToggle({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="grid w-[116px] grid-cols-2 rounded-xl bg-white p-1 shadow-inner shadow-slate-200/60">
        {(["O", "X"] as const).map((item) => (
          <button key={item} type="button" onClick={() => onChange(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${value === item ? "bg-blue-600 text-white" : "text-slate-500"}`}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

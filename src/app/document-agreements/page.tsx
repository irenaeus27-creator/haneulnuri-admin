"use client";

import { useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";

type Row = Record<string, string | number | boolean | null | undefined>;
type ApiResult = { ok?: boolean; message?: string; experienceConsents?: Row[]; data?: { experienceConsents?: Row[] } };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function dateText(value: unknown) {
  return text(value).substring(0, 10);
}

function dateTimeText(value: unknown) {
  const raw = text(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function boolText(value: unknown) {
  if (value === true) return "O";
  if (value === false) return "X";
  return text(value) || "-";
}

function isSelected(value: unknown) {
  const raw = text(value).toUpperCase();
  return value === true || raw === "O" || raw === "Y" || raw === "YES" || raw === "TRUE";
}

function productList(row: Row) {
  const list = [
    isSelected(row.actionCam) ? "액션캠" : "",
    isSelected(row.simulator) ? "시뮬레이터" : "",
    isSelected(row.photoPrint) ? "사진 인화" : "",
  ].filter(Boolean);
  return list;
}

function productText(row: Row) {
  const list = productList(row);
  return list.length ? list.join(", ") : "-";
}

function marketingText(row: Row) {
  return isSelected(row.marketingConsent) ? "동의" : "미동의";
}

function qrUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=16&data=${encodeURIComponent(value)}`;
}

export default function DocumentAgreementsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const publicUrl = useMemo(() => `${origin || ""}/experience-consent`, [origin]);

  async function loadData() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/experience-consents", { cache: "no-store" });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || !data.ok) throw new Error(data.message || "체험 동의서 목록을 불러오지 못했습니다.");
      const list = Array.isArray(data.experienceConsents) ? data.experienceConsents : Array.isArray(data.data?.experienceConsents) ? data.data.experienceConsents : [];
      setRows(list);
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "체험 동의서 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = rows.filter((row) => {
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    return [row.passengerName, row.phone, row.flightDate, row.reservationSource, row.consentId, row.signatureName, productText(row), marketingText(row)]
      .map((value) => text(value).toLowerCase())
      .join(" ")
      .includes(q);
  });

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setMessage("QR 서약서 링크를 복사했습니다.");
  }

  return (
    <PageContainer title="체험 동의서 관리" description="대기실 QR코드로 체험객 탑승자 서약서를 모바일에서 작성받습니다.">
      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">대기실 QR 코드</h2>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-blue-50/60 p-5">
            <div className="flex flex-col items-center text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">SKYNURI CONSENT</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">탑승자 서약서</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">아래 QR코드를 프린트해서 비행장 대기실에 비치하세요.</p>
              <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                {publicUrl ? <img src={qrUrl(publicUrl)} alt="체험 동의서 QR 코드" className="h-[260px] w-[260px]" /> : <div className="h-[260px] w-[260px] animate-pulse rounded-2xl bg-slate-100" />}
              </div>
              <p className="mt-4 break-all rounded-2xl bg-white px-4 py-3 text-xs leading-5 text-slate-500">{publicUrl || "링크 생성 중"}</p>
              <div className="mt-4 grid w-full grid-cols-2 gap-2">
                <button type="button" onClick={copyLink} className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">링크 복사</button>
                <a href={publicUrl || "#"} target="_blank" className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-blue-600/20">작성 페이지 열기</a>
              </div>
              <button type="button" onClick={() => window.print()} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">QR 인쇄</button>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            QR을 스캔하면 모바일 전용 서약서 페이지로 이동합니다. 제출된 서약서는 아래 목록에서 확인할 수 있습니다.
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="shrink-0 text-lg font-semibold tracking-[-0.03em] text-slate-950">제출된 체험 동의서</h2>
          </div>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <input className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="성명, 연락처, 탑승일, 예약경로, 추가상품, 마케팅 동의 검색" />
            <button onClick={loadData} className="min-w-[104px] whitespace-nowrap rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold leading-none text-slate-700">새로고침</button>
          </div>
          {message ? <p className="mb-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</p> : null}
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="min-w-[980px] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">제출</th>
                  <th className="px-4 py-3">탑승자</th>
                  <th className="px-4 py-3">탑승일</th>
                  <th className="px-4 py-3">연락처</th>
                  <th className="px-4 py-3">추가상품</th>
                  <th className="px-4 py-3">마케팅</th>
                  <th className="px-4 py-3">건강</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">불러오는 중...</td></tr> : null}
                {!loading && filtered.map((row) => (
                  <tr key={text(row.consentId)}>
                    <td className="px-4 py-3 text-xs text-slate-500">{dateTimeText(row.createdAt)}</td>
                    <td className="px-4 py-3"><div className="font-semibold text-slate-900">{text(row.passengerName) || "-"}</div><div className="text-xs text-slate-500">{dateText(row.birthDate)}</div></td>
                    <td className="px-4 py-3">{dateText(row.flightDate) || "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{text(row.phone) || "-"}</td>
                    <td className="px-4 py-3">
                      <ProductBadges row={row} />
                    </td>
                    <td className="px-4 py-3"><MarketingBadge row={row} /></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.healthClear === false ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{row.healthClear === false ? "No" : "Yes"}</span></td>
                    <td className="px-4 py-3"><button onClick={() => setSelected(row)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">상세</button></td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">표시할 서약서가 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[88vh] w-full max-w-[680px] overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-500">CONSENT DETAIL</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{text(selected.passengerName) || "탑승자"}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">닫기</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Info label="접수번호" value={text(selected.consentId)} />
              <Info label="제출일시" value={dateTimeText(selected.createdAt)} />
              <Info label="생년월일" value={dateText(selected.birthDate)} />
              <Info label="전화번호" value={text(selected.phone)} />
              <Info label="탑승일" value={dateText(selected.flightDate)} />
              <Info label="예약경로" value={text(selected.reservationSource)} />
              <Info label="선택 추가상품" value={productText(selected)} />
              <Info label="액션캠" value={boolText(selected.actionCam)} />
              <Info label="시뮬레이터" value={boolText(selected.simulator)} />
              <Info label="사진 인화" value={boolText(selected.photoPrint)} />
              <Info label="마케팅 동의" value={boolText(selected.marketingConsent)} />
              <Info label="건강상태" value={selected.healthClear === false ? "No" : "Yes"} />
              <Info label="혈액형" value={text(selected.bloodType) || "-"} />
              <Info label="비상연락처" value={`${text(selected.emergencyContactName) || "-"} / ${text(selected.emergencyContactPhone) || "-"}`} />
              <Info label="서명자" value={text(selected.signatureName)} />
              <Info label="서명일시" value={dateTimeText(selected.signedAt)} />
              <Info label="서약서 버전" value={text(selected.agreementVersion) || "-"} />
              <Info label="제출 IP" value={text(selected.ipAddress) || "-"} />
              <div className="sm:col-span-2"><Info label="기기 정보" value={text(selected.userAgent) || "-"} /></div>
              {text(selected.signatureImageUrl) ? (
                <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium text-slate-500">자필 서명 이미지</div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <img
                      src={text(selected.signatureImageUrl)}
                      alt="자필 서명"
                      className="max-h-[180px] w-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="sm:col-span-2"><Info label="자필 서명 이미지" value="저장된 서명 이미지 없음" /></div>
              )}
              <div className="sm:col-span-2"><Info label="주소" value={text(selected.address) || "-"} /></div>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}

function MarketingBadge({ row }: { row: Row }) {
  const selected = isSelected(row.marketingConsent);
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${selected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {selected ? "동의" : "미동의"}
    </span>
  );
}

function ProductBadges({ row }: { row: Row }) {
  const items = productList(row);
  if (!items.length) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
          {item}
        </span>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "-"}</div>
    </div>
  );
}

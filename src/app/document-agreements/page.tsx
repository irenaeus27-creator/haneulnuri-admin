"use client";

import { useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";

type Row = Record<string, string | number | boolean | null | undefined>;
type ApiResult = {
  ok?: boolean;
  message?: string;
  experienceConsents?: Row[];
  data?: { experienceConsents?: Row[] };
};

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
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function formatPhone(value: unknown) {
  const raw = text(value);
  if (!raw) return "-";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;

  if (digits.startsWith("02")) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return raw;
}

function boolText(value: unknown) {
  if (value === true) return "O";
  if (value === false) return "X";
  return text(value) || "-";
}

function verifiedAtOf(row: Row) {
  return text(row.verifiedAt || row.verified_at);
}

function verificationMethodOf(row: Row) {
  return text(row.verificationMethod || row.verification_method);
}

function verifiedByOf(row: Row) {
  return text(row.verifiedBy || row.verified_by);
}

function verificationMemoOf(row: Row) {
  return text(row.verificationMemo || row.verification_memo);
}

function isSelected(value: unknown) {
  const raw = text(value).toUpperCase();
  return (
    value === true ||
    raw === "O" ||
    raw === "Y" ||
    raw === "YES" ||
    raw === "TRUE"
  );
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

function escapeHtml(value: unknown) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function DocumentAgreementsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [savingConfirmId, setSavingConfirmId] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const publicUrl = useMemo(
    () => `${origin || ""}/experience-consent`,
    [origin],
  );

  async function loadData() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/experience-consents", {
        cache: "no-store",
      });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || !data.ok)
        throw new Error(
          data.message || "체험 동의서 목록을 불러오지 못했습니다.",
        );
      const list = Array.isArray(data.experienceConsents)
        ? data.experienceConsents
        : Array.isArray(data.data?.experienceConsents)
          ? data.data.experienceConsents
          : [];
      setRows(list);
    } catch (error) {
      setRows([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "체험 동의서 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = rows.filter((row) => {
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    return [
      row.passengerName,
      row.phone,
      row.flightDate,
      row.reservationSource,
      row.consentId,
      row.signatureName,
      productText(row),
      marketingText(row),
    ]
      .map((value) => text(value).toLowerCase())
      .join(" ")
      .includes(q);
  });

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setMessage("QR 서약서 링크를 복사했습니다.");
  }

  function handlePrintQrPoster() {
    if (!publicUrl) {
      setMessage("QR 링크를 준비하는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=980,height=1280");
    if (!printWindow) {
      setMessage("인쇄 창을 열지 못했습니다. 팝업 차단을 확인해주세요.");
      return;
    }

    const safeUrl = escapeHtml(publicUrl);
    const qrImage = qrUrl(publicUrl);

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>하늘누리 비행교육원 탑승자 서약서 QR 안내</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      color: #0d1b35;
      background: #eef4fb;
      font-family: Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 22px; }
    .toolbar {
      width: 100%;
      max-width: 202mm;
      margin: 0 auto 12px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .toolbar button {
      height: 42px;
      border: 1px solid #bdd2ef;
      border-radius: 14px;
      padding: 0 18px;
      background: #0b47a1;
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
    }
    .toolbar button.secondary {
      background: #fff;
      color: #243b63;
    }
    .sheet {
      position: relative;
      width: 100%;
      max-width: 202mm;
      min-height: 286mm;
      margin: 0 auto;
      padding: 18mm 14mm 12mm;
      overflow: hidden;
      background:
        radial-gradient(circle at 78% 11%, rgba(69, 135, 213, 0.10), transparent 26%),
        linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
      border: 1px solid #d8e5f5;
      box-shadow: 0 24px 70px rgba(15, 38, 80, 0.14);
    }
    .kicker {
      color: #125bc4;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.36em;
    }
    .hero-top {
      position: relative;
      min-height: 82mm;
      padding-right: 75mm;
    }
    h1 {
      margin: 9px 0 0;
      color: #081936;
      font-size: 39px;
      line-height: 1.04;
      letter-spacing: -0.055em;
      font-weight: 900;
    }
    .subtitle {
      margin: 18px 0 0;
      color: #0f203f;
      font-size: 18px;
      line-height: 1.45;
      letter-spacing: -0.025em;
      font-weight: 800;
    }
    .lead {
      margin: 5px 0 0;
      color: #263c5e;
      font-size: 14.5px;
      line-height: 1.7;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .lead-en {
      margin-top: 13px;
      color: #5d7190;
      font-size: 13.2px;
      line-height: 1.55;
      font-weight: 500;
    }
    .badge {
      position: absolute;
      top: 1mm;
      right: 0;
      display: inline-flex;
      height: 42px;
      align-items: center;
      justify-content: center;
      padding: 0 22px;
      border-radius: 999px;
      background: linear-gradient(135deg, #0b3a78, #0c5dcc);
      color: #fff;
      font-size: 14px;
      font-weight: 850;
      box-shadow: 0 10px 24px rgba(10, 82, 180, 0.20);
    }
    .plane {
      position: absolute;
      right: -2mm;
      top: 34mm;
      width: 94mm;
      height: 40mm;
      opacity: 0.50;
      color: #8fb2dd;
    }
    .content {
      display: grid;
      grid-template-columns: minmax(0, 1.02fr) minmax(0, 1fr);
      gap: 8mm;
      align-items: stretch;
      margin-top: 5mm;
    }
    .panel {
      border: 1px solid #d7e5f6;
      border-radius: 26px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 10px 34px rgba(30, 62, 110, 0.06);
    }
    .steps-panel {
      padding: 20px 20px 18px;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 15px;
    }
    .title-icon {
      display: inline-flex;
      width: 48px;
      height: 48px;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: linear-gradient(135deg, #236de0, #0b4cac);
      color: #fff;
      box-shadow: 0 10px 22px rgba(35, 109, 224, 0.18);
    }
    .section-title h2 {
      margin: 0;
      color: #07172f;
      font-size: 25px;
      line-height: 1.15;
      letter-spacing: -0.045em;
      font-weight: 900;
    }
    .step {
      position: relative;
      display: grid;
      grid-template-columns: 36px 52px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      min-height: 33mm;
      margin-top: 10px;
      padding: 13px 14px;
      border: 1px solid #dfeaf8;
      border-radius: 18px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    }
    .num {
      align-self: start;
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: #1f68d5;
      color: #fff;
      font-size: 15px;
      font-weight: 900;
    }
    .step-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #07172f;
    }
    .step strong {
      display: block;
      color: #07172f;
      font-size: 16px;
      line-height: 1.25;
      letter-spacing: -0.03em;
      font-weight: 850;
    }
    .step p {
      margin: 6px 0 0;
      color: #304663;
      font-size: 11.8px;
      line-height: 1.48;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .step p span {
      display: block;
      margin-top: 4px;
      color: #6c7f9a;
      font-size: 10.9px;
      line-height: 1.42;
      font-weight: 500;
      letter-spacing: -0.01em;
    }
    .notice {
      margin-top: 12px;
      padding: 13px 15px 13px;
      border: 1px solid #dfeaf8;
      border-radius: 18px;
      background: #f8fbff;
    }
    .notice-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px;
      color: #07172f;
      font-size: 14px;
      font-weight: 850;
      letter-spacing: -0.02em;
    }
    .notice ul {
      margin: 0;
      padding-left: 17px;
      color: #243b63;
      font-size: 11.2px;
      line-height: 1.45;
      font-weight: 600;
    }
    .notice li { margin-top: 5px; }
    .notice span {
      color: #7a8aa0;
      font-weight: 500;
    }
    .qr-panel {
      position: relative;
      padding: 20px 22px 18px;
      text-align: center;
      overflow: hidden;
    }
    .qr-panel::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 7px;
      background: linear-gradient(90deg, #0b3a78, #1769d8);
    }
    .qr-title {
      margin: 19px 0 0;
      color: #125bc4;
      font-size: 13px;
      letter-spacing: 0.36em;
      font-weight: 900;
    }
    .qr-panel h2 {
      margin: 10px 0 0;
      color: #07172f;
      font-size: 33px;
      line-height: 1.05;
      letter-spacing: -0.05em;
      font-weight: 900;
    }
    .divider {
      width: 44px;
      height: 2px;
      margin: 16px auto 15px;
      border-radius: 99px;
      background: #1f68d5;
    }
    .qr-desc {
      margin: 0;
      color: #314864;
      font-size: 12.7px;
      line-height: 1.6;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .qr-desc span {
      display: block;
      margin-top: 5px;
      color: #6b7e97;
      font-weight: 500;
    }
    .qr-wrap {
      width: 78mm;
      height: 78mm;
      margin: 15px auto 11px;
      padding: 11px;
      border: 1px solid #d9e7f8;
      border-radius: 24px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 0 1px #f5f8fd;
    }
    .qr-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
    }
    .url-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 42px;
      margin: 0 auto;
      padding: 9px 12px;
      border: 1px solid #d6e4f6;
      border-radius: 16px;
      background: #f8fbff;
      color: #1664cd;
      font-size: 12.1px;
      font-weight: 700;
      line-height: 1.35;
      word-break: break-all;
      text-align: left;
    }
    .qr-caption {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #dbe7f7;
      text-align: left;
    }
    .phone-icon {
      display: flex;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: #edf5ff;
      color: #1f68d5;
    }
    .qr-caption strong {
      display: block;
      color: #10213f;
      font-size: 13.4px;
      letter-spacing: -0.02em;
    }
    .qr-caption span {
      display: block;
      margin-top: 4px;
      color: #6b7e97;
      font-size: 11.5px;
      line-height: 1.4;
    }
    .footer {
      position: absolute;
      left: 14mm;
      right: 14mm;
      bottom: 11mm;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      padding-top: 11px;
      border-top: 1.5px solid #173b70;
      color: #64748b;
      font-size: 11px;
      line-height: 1.45;
    }
    .footer strong {
      display: block;
      color: #0b47a1;
      font-size: 16px;
      line-height: 1.1;
      letter-spacing: -0.025em;
      font-weight: 900;
    }
    .footer .en {
      color: #0b47a1;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .footer-mark {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .logo-mark {
      display: inline-flex;
      width: 42px;
      height: 42px;
      align-items: center;
      justify-content: center;
      border: 1.5px solid #0b47a1;
      border-radius: 999px;
      color: #0b47a1;
    }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body { padding: 0; background: #fff; }
      .toolbar { display: none; }
      .sheet {
        width: 210mm;
        max-width: none;
        min-height: 297mm;
        height: 297mm;
        margin: 0;
        padding: 18mm 14mm 12mm;
        border: none;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="secondary" onclick="window.close()">닫기</button>
    <button onclick="window.print()">인쇄하기</button>
  </div>

  <main class="sheet">
    <section class="hero-top">
      <div class="kicker">SKYNURI FLIGHT</div>
      <h1>하늘누리 비행교육원</h1>
      <p class="subtitle">체험비행 탑승 전 모바일 서약서 작성</p>
      <p class="lead">스마트폰 카메라로 QR을 스캔한 뒤 안내에 따라 작성해주세요.</p>
      <p class="lead-en">Please scan the QR code and complete the consent form<br/>on your phone before boarding.</p>
      <div class="badge">체험객 안내용</div>
      <svg class="plane" viewBox="0 0 520 210" fill="none" aria-hidden="true">
        <path d="M60 118C120 91 206 65 300 50C361 40 420 42 480 61L321 100L214 164L184 157L263 107L133 127L88 153L60 118Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
        <path d="M178 99L106 45L132 40L245 83" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <path d="M331 96L424 162L391 169L286 112" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <path d="M83 116C73 92 52 86 35 97C18 108 25 132 47 134C63 135 78 128 83 116Z" stroke="currentColor" stroke-width="4"/>
        <path d="M86 117H126" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <path d="M150 134C159 150 180 155 197 145" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <path d="M246 129C255 145 276 150 293 140" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <circle cx="192" cy="151" r="9" stroke="currentColor" stroke-width="4"/>
        <circle cx="288" cy="146" r="9" stroke="currentColor" stroke-width="4"/>
        <path d="M34 96L11 75M35 135L5 153M31 116H0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      </svg>
    </section>

    <section class="content">
      <article class="panel steps-panel">
        <div class="section-title">
          <div class="title-icon">
            <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
              <path d="M14 2v6h6"/>
              <path d="M9 15l2 2 5-5"/>
            </svg>
          </div>
          <h2>서약서 작성 방법</h2>
        </div>

        <div class="step">
          <div class="num">1</div>
          <div class="step-icon">
            <svg width="42" height="56" viewBox="0 0 42 56" fill="none" stroke="currentColor" stroke-width="2.8">
              <rect x="8" y="2" width="26" height="52" rx="5"/>
              <path d="M17 8h8"/>
              <path d="M15 19h5v5h-5zM23 19h4v4h-4zM15 27h4v4h-4zM23 28h5v5h-5zM15 35h5v5h-5zM23 37h3v3h-3z"/>
            </svg>
          </div>
          <div>
            <strong>QR 코드 스캔</strong>
            <p>스마트폰 카메라 또는 QR 스캔 앱으로 오른쪽 QR 코드를 스캔해주세요.<span>Scan the QR code with your phone camera or QR scanner.</span></p>
          </div>
        </div>

        <div class="step">
          <div class="num">2</div>
          <div class="step-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.8">
              <rect x="7" y="6" width="34" height="36" rx="4"/>
              <circle cx="20" cy="20" r="6"/>
              <path d="M12 35c2-7 14-7 16 0"/>
              <path d="M31 18h6M31 26h6M31 34h4"/>
            </svg>
          </div>
          <div>
            <strong>탑승자 정보 입력</strong>
            <p>성명, 생년월일, 연락처, 탑승일과 추가 상품 선택 항목을 정확히 작성해주세요.<span>Enter participant details such as name, birth date, contact information, flight date, and options.</span></p>
          </div>
        </div>

        <div class="step">
          <div class="num">3</div>
          <div class="step-icon">
            <svg width="50" height="50" viewBox="0 0 50 50" fill="none" stroke="currentColor" stroke-width="2.8">
              <path d="M31 7l12 12-23 23H8V30L31 7Z"/>
              <path d="M27 11l12 12"/>
              <path d="M7 44c8-5 13 2 21-3 4-2 6-5 11-4"/>
            </svg>
          </div>
          <div>
            <strong>자필 서명 후 제출</strong>
            <p>안내에 따라 자필 서명을 완료하고 제출해주세요. 제출 후 직원에게 제출 여부를 보여주세요.<span>Complete your handwritten signature and show the completion screen to the staff.</span></p>
          </div>
        </div>

        <div class="notice">
          <p class="notice-title">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1f68d5" stroke-width="2.2">
              <path d="M12 3l7 3v6c0 4.5-2.8 7.8-7 9-4.2-1.2-7-4.5-7-9V6l7-3Z"/>
              <path d="m9 12 2 2 4-5"/>
            </svg>
            작성 전 확인해주세요
          </p>
          <ul>
            <li>탑승자 본인의 정보로 작성해주세요.<br/><span>Please enter the passenger's own information.</span></li>
            <li>제출 완료 후에는 현장 직원에게 제출 여부를 보여주세요.<br/><span>After submitting, please show the completion screen to the staff.</span></li>
            <li>문제가 있으면 안내 데스크 또는 담당 교관에게 문의해주세요.<br/><span>If you need help, please ask the front desk or your instructor.</span></li>
          </ul>
        </div>
      </article>

      <aside class="panel qr-panel">
        <p class="qr-title">MOBILE CONSENT</p>
        <h2>탑승자 서약서</h2>
        <div class="divider"></div>
        <p class="qr-desc">아래 QR을 스캔하면 모바일 작성 페이지로 이동합니다.<span>Scan the QR code below to open the mobile consent page.</span></p>
        <div class="qr-wrap"><img src="${qrImage}" alt="체험 동의서 QR 코드" /></div>
        <div class="url-chip">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#1f68d5" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2c3 3 4 6 4 10s-1 7-4 10M12 2c-3 3-4 6-4 10s1 7 4 10"/>
          </svg>
          <span>${safeUrl}</span>
        </div>
        <div class="qr-caption">
          <div class="phone-icon">
            <svg width="21" height="25" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="5" y="2" width="14" height="24" rx="3"/>
              <path d="M10 22h4"/>
            </svg>
          </div>
          <div>
            <strong>QR 스캔 후 모바일에서 작성 · 제출</strong>
            <span>Scan the QR code and submit on your phone.</span>
          </div>
        </div>
      </aside>
    </section>

    <footer class="footer">
      <div class="footer-mark">
        <div class="logo-mark">
          <svg width="31" height="24" viewBox="0 0 60 42" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M4 27c15-2 30-10 50-23-10 14-23 25-42 32"/>
            <path d="M13 25l17 3M23 20l20 1"/>
          </svg>
        </div>
        <div>
          <strong>하늘누리 비행교육원</strong>
          <div class="en">SKYNURI FLIGHT ACADEMY</div>
        </div>
      </div>
      <div style="text-align:right;">
        안전한 비행, 신뢰의 교육<br/>
        <span style="font-size:10px; color:#7b8da6;">Safe Flight, Trusted Training</span>
      </div>
    </footer>
  </main>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setMessage("QR 인쇄용 안내 페이지를 열었습니다.");
  }

  async function confirmSubmitted(row: Row) {
    const consentId = text(row.consentId);
    if (!consentId || savingConfirmId) return;
    try {
      setSavingConfirmId(consentId);
      setMessage("");
      const response = await fetch("/api/experience-consents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentId,
          verificationMethod: "onsite_submission_checked",
          verifiedBy: "현장 확인",
          verificationMemo: "현장에서 서약서 제출 여부 확인",
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        data?: Row;
        experienceConsent?: Row;
      };
      if (!response.ok || !data.ok)
        throw new Error(
          data.message || "서약서 제출 확인 저장에 실패했습니다.",
        );
      const updatedRaw = (data.experienceConsent || data.data || {}) as Row;
      const nowText = new Date().toISOString();
      const updated: Row = {
        ...updatedRaw,
        verificationMethod:
          text(updatedRaw.verificationMethod || updatedRaw.verification_method) ||
          "submission_checked",
        verifiedBy:
          text(updatedRaw.verifiedBy || updatedRaw.verified_by) || "현장 확인",
        verifiedAt: text(updatedRaw.verifiedAt || updatedRaw.verified_at) || nowText,
        verificationMemo:
          text(updatedRaw.verificationMemo || updatedRaw.verification_memo) ||
          "현장에서 서약서 제출 여부 확인",
      };
      setRows((prev) =>
        prev.map((item) =>
          text(item.consentId) === consentId
            ? { ...item, ...updated, verifiedAt: text(updated.verifiedAt) }
            : item,
        ),
      );
      setSelected((prev) =>
        prev && text(prev.consentId) === consentId
          ? { ...prev, ...updated, verifiedAt: text(updated.verifiedAt) }
          : prev,
      );
      setMessage("서약서 제출 확인을 저장했습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "서약서 제출 확인 저장에 실패했습니다.",
      );
    } finally {
      setSavingConfirmId("");
    }
  }

  return (
    <PageContainer
      title="체험 동의서 관리"
      description="대기실 QR코드로 체험객 탑승자 서약서를 모바일에서 작성받습니다."
    >
      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">
              대기실 QR 코드
            </h2>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-blue-50/60 p-5">
            <div className="flex flex-col items-center text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">
                SKYNURI CONSENT
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                탑승자 서약서
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                아래 QR코드를 프린트해서 비행장 대기실에 비치하세요.
              </p>
              <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                {publicUrl ? (
                  <img
                    src={qrUrl(publicUrl)}
                    alt="체험 동의서 QR 코드"
                    className="h-[260px] w-[260px]"
                  />
                ) : (
                  <div className="h-[260px] w-[260px] animate-pulse rounded-2xl bg-slate-100" />
                )}
              </div>
              <div className="mt-5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                <div className="flex items-start gap-2 text-[13px] font-medium leading-5 text-slate-500">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.5 5.43" />
                    <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07l1.62-1.62" />
                  </svg>
                  <span className="break-all">{publicUrl || "링크 생성 중"}</span>
                </div>
              </div>
              <div className="mt-5 grid w-full grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[18px] border border-blue-200 bg-white px-4 text-[14px] font-medium tracking-[-0.01em] text-slate-700 shadow-sm shadow-slate-200/30 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <svg className="h-4.5 w-4.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span className="whitespace-nowrap">링크 복사</span>
                </button>
                <a
                  href={publicUrl || "#"}
                  target="_blank"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[18px] border border-blue-200 bg-blue-50 px-4 text-center text-[14px] font-medium tracking-[-0.01em] text-blue-700 shadow-sm shadow-blue-100/50 transition hover:border-blue-300 hover:bg-blue-100"
                >
                  <svg className="h-4.5 w-4.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 17 17 7" />
                    <path d="M8 7h9v9" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
                  </svg>
                  <span className="whitespace-nowrap">작성 페이지</span>
                </a>
                <button
                  type="button"
                  onClick={handlePrintQrPoster}
                  className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-[18px] border border-blue-200 bg-white px-4 text-[14px] font-medium tracking-[-0.01em] text-slate-700 shadow-sm shadow-slate-200/30 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <svg className="h-4.5 w-4.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9V2h12v7" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 14h12v8H6z" />
                  </svg>
                  <span className="whitespace-nowrap">QR 인쇄</span>
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            QR을 스캔하면 모바일 전용 서약서 페이지로 이동합니다. 제출된
            서약서는 아래 목록에서 확인할 수 있습니다.
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="shrink-0 text-lg font-semibold tracking-[-0.03em] text-slate-950">
              제출된 체험 동의서
            </h2>
          </div>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <input
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="성명, 연락처, 탑승일, 예약경로, 추가상품, 마케팅 동의 검색"
            />
            <button
              onClick={loadData}
              className="min-w-[104px] whitespace-nowrap rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold leading-none text-slate-700"
            >
              새로고침
            </button>
          </div>
          {message ? (
            <p className="mb-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {message}
            </p>
          ) : null}
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
                  <th className="px-4 py-3">제출확인</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      불러오는 중...
                    </td>
                  </tr>
                ) : null}
                {!loading &&
                  filtered.map((row) => (
                    <tr key={text(row.consentId)}>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {dateTimeText(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {text(row.passengerName) || "-"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {dateText(row.birthDate)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {dateText(row.flightDate) || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatPhone(row.phone)}
                      </td>
                      <td className="px-4 py-3">
                        <ProductBadges row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <MarketingBadge row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${row.healthClear === false ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
                        >
                          {row.healthClear === false ? "No" : "Yes"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {verifiedAtOf(row) ? (
                          <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            확인됨
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => confirmSubmitted(row)}
                            disabled={savingConfirmId === text(row.consentId)}
                            className="whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingConfirmId === text(row.consentId)
                              ? "저장 중"
                              : "제출 확인"}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(row)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  ))}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      표시할 서약서가 없습니다.
                    </td>
                  </tr>
                ) : null}
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
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-500">
                  CONSENT DETAIL
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  {text(selected.passengerName) || "탑승자"}
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                닫기
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Info label="접수번호" value={text(selected.consentId)} />
              <Info label="제출일시" value={dateTimeText(selected.createdAt)} />
              <Info label="생년월일" value={dateText(selected.birthDate)} />
              <Info label="전화번호" value={formatPhone(selected.phone)} />
              <Info label="탑승일" value={dateText(selected.flightDate)} />
              <Info label="예약경로" value={text(selected.reservationSource)} />
              <Info label="선택 추가상품" value={productText(selected)} />
              <Info label="액션캠" value={boolText(selected.actionCam)} />
              <Info label="시뮬레이터" value={boolText(selected.simulator)} />
              <Info label="사진 인화" value={boolText(selected.photoPrint)} />
              <Info
                label="마케팅 동의"
                value={boolText(selected.marketingConsent)}
              />
              <Info
                label="건강상태"
                value={selected.healthClear === false ? "No" : "Yes"}
              />
              <Info label="혈액형" value={text(selected.bloodType) || "-"} />
              <Info
                label="비상연락처"
                value={`${text(selected.emergencyContactName) || "-"} / ${formatPhone(selected.emergencyContactPhone)}`}
              />
              <Info label="서명자" value={text(selected.signatureName)} />
              <Info label="서명일시" value={dateTimeText(selected.signedAt)} />
              <Info
                label="서약서 버전"
                value={text(selected.agreementVersion) || "-"}
              />
              <Info label="제출 IP" value={text(selected.ipAddress) || "-"} />
              <div className="sm:col-span-2">
                <Info
                  label="기기 정보"
                  value={text(selected.userAgent) || "-"}
                />
              </div>
              <Info
                label="서약 제출 확인"
                value={
                  verifiedAtOf(selected)
                    ? `확인됨 · ${dateTimeText(verifiedAtOf(selected))}`
                    : "미확인"
                }
              />
              <Info
                label="확인 방식"
                value={verificationMethodText(verificationMethodOf(selected))}
              />
              {text(selected.signatureImageUrl) ? (
                <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium text-slate-500">
                    자필 서명 이미지
                  </div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <img
                      src={text(selected.signatureImageUrl)}
                      alt="자필 서명"
                      className="max-h-[180px] w-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <Info
                    label="자필 서명 이미지"
                    value="저장된 서명 이미지 없음"
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <Info label="주소" value={text(selected.address) || "-"} />
              </div>
              <div className="sm:col-span-2">
                <Info
                  label="서약서 원문 스냅샷"
                  value={
                    text(selected.agreementSnapshot) ||
                    text(selected.agreementText) ||
                    "-"
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}

function verificationMethodText(value: unknown) {
  const raw = text(value);
  if (raw === "onsite_submission_checked") return "현장 제출 확인";
  if (raw === "submission_checked") return "현장 제출 확인";
  if (raw === "phone") return "전화번호 확인";
  if (raw === "id_card") return "신분증 확인";
  if (raw === "guardian") return "보호자 확인";
  if (raw === "other") return "기타";
  return raw || "-";
}

function MarketingBadge({ row }: { row: Row }) {
  const selected = isSelected(row.marketingConsent);
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${selected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
    >
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
        <span
          key={item}
          className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
        >
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
      <div className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value || "-"}
      </div>
    </div>
  );
}

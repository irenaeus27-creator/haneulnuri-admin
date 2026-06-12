"use client";

import { FormEvent, ReactNode, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

type SubmitResult = {
  ok?: boolean;
  message?: string;
  consentId?: string;
};

type Language = "ko" | "en" | "zh" | "ja";

type FormState = {
  passengerName: string;
  birthDate: string;
  address: string;
  phone: string;
  actionCam: string;
  simulator: string;
  photoPrint: string;
  marketingConsent: string;
  reservationSources: string[];
  flightDate: string;
  healthClear: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bloodType: string;
  signatureName: string;
  signatureDataUrl: string;
  understood: boolean;
  saveConsent: boolean;
};

const AGREEMENT_VERSION = "experience-passenger-waiver-v2026-06-13-multilang";

const initialForm: FormState = {
  passengerName: "",
  birthDate: "",
  address: "",
  phone: "",
  actionCam: "X",
  simulator: "X",
  photoPrint: "X",
  marketingConsent: "X",
  reservationSources: [],
  flightDate: "",
  healthClear: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  bloodType: "",
  signatureName: "",
  signatureDataUrl: "",
  understood: false,
  saveConsent: false,
};

const sourceOptions = [
  { value: "네이버", ko: "네이버", en: "Naver", zh: "Naver", ja: "Naver" },
  { value: "구글", ko: "구글", en: "Google", zh: "Google", ja: "Google" },
  { value: "유튜브", ko: "유튜브", en: "YouTube", zh: "YouTube", ja: "YouTube" },
  { value: "인스타그램", ko: "인스타그램", en: "Instagram", zh: "Instagram", ja: "Instagram" },
  { value: "지인추천", ko: "지인추천", en: "Referral", zh: "熟人推荐", ja: "知人の紹介" },
  { value: "현장방문", ko: "현장방문", en: "Walk-in visit", zh: "现场访问", ja: "現地訪問" },
  { value: "기타", ko: "기타", en: "Other", zh: "其他", ja: "その他" },
];

const bloodTypeOptions = [
  { value: "A형 RH+", label: "A RH+" },
  { value: "A형 RH-", label: "A RH-" },
  { value: "B형 RH+", label: "B RH+" },
  { value: "B형 RH-", label: "B RH-" },
  { value: "AB형 RH+", label: "AB RH+" },
  { value: "AB형 RH-", label: "AB RH-" },
  { value: "O형 RH+", label: "O RH+" },
  { value: "O형 RH-", label: "O RH-" },
  { value: "모름/미입력", label: "unknown" },
];

const agreementClauses: Record<Language, string[]> = {
  ko: [
    "위 본인은 본인의 의사에 따라 하늘누리 비행교육원의 경량항공기에 탑승하고자 한다.",
    "탑승 과정 또는 비행 중 어떠한 사고나 본인의 부주의에 의한 과실로 인하여 발생하는 인적, 물적 사고의 손해배상책임은 전적으로 본인에게 있으므로 하늘누리 비행교육원에 어떠한 민, 형사상의 책임을 묻지 않는다.",
    "만약 사고 발생 시에는 하늘누리 비행교육원을 대신하여 보험회사로부터 지급받는 보험금만으로 손해보전을 받겠으며 하늘누리 비행교육원 측에 대한 어떠한 손해배상청구권도 포기합니다. (다만, 항공기 운행자의 고의 또는 중과실에 의한 사고는 제외함.)",
    "하늘누리 비행교육원에 대한 손해배상청구권은 사고 발생일로부터 1년간 행사하지 아니할 때에는 시효로 인하여 소멸하는 것에 동의합니다.",
    "본인은 관숙(체험)비행을 하는데 지장을 초래할 만한 신체적, 정신적 문제가 없습니다.",
    "본 서약은 어떠한 강요나 착오에 의한 것이 아니고, 본인이 그 내용을 충분히 이해한 후 자유로운 의사에 의한 것임을 확인합니다.",
  ],
  en: [
    "I voluntarily choose to board and fly in a light aircraft operated by SKYNURI Flight Education Center.",
    "I acknowledge that I am solely responsible for any personal injury or property damage that may occur due to my own negligence or fault during boarding or flight, and I shall not hold SKYNURI Flight Education Center liable for any civil or criminal responsibility arising therefrom.",
    "In the event of an accident, I agree to receive compensation only through the insurance benefits paid by the insurance company on behalf of SKYNURI Flight Education Center, and I waive any right to claim additional damages from SKYNURI Flight Education Center. However, this does not apply in cases where the aircraft operator’s willful misconduct or gross negligence is proven.",
    "I agree that my right to claim damages against SKYNURI Flight Education Center shall expire if not exercised within one (1) year from the date of the incident.",
    "I confirm that I have no physical or mental conditions that would interfere with my participation in the familiarization experience flight.",
    "I confirm that this agreement is made voluntarily, without any coercion or misunderstanding, and that I fully understand its contents and agree of my own free will.",
  ],
  zh: [
    "本人自愿按照本人意愿搭乘 SKYNURI 飞行教育中心运营的轻型航空器并参加飞行。",
    "本人确认，因本人疏忽或过失在登机过程或飞行过程中发生的人身或财产损害，其损害赔偿责任由本人自行承担，并且不向 SKYNURI 飞行教育中心追究任何民事或刑事责任。",
    "如发生事故，本人同意仅通过保险公司代表 SKYNURI 飞行教育中心支付的保险金获得赔偿，并放弃向 SKYNURI 飞行教育中心提出任何额外损害赔偿请求的权利。但航空器运营者存在故意或重大过失的情况除外。",
    "本人同意，针对 SKYNURI 飞行教育中心的损害赔偿请求权，如自事故发生日起一年内未行使，将因时效届满而消灭。",
    "本人确认不存在会妨碍参加熟悉体验飞行的身体或精神方面的问题。",
    "本人确认，本承诺书并非因任何强迫或误解而作出，而是在充分理解其内容后，基于本人自由意愿作出的同意。",
  ],
  ja: [
    "私は、本人の意思により、SKYNURI飛行教育センターが運航する軽量航空機に搭乗し飛行に参加します。",
    "搭乗過程または飛行中に、本人の不注意または過失により発生した人的・物的損害については、本人が全責任を負い、SKYNURI飛行教育センターに対していかなる民事上または刑事上の責任も問いません。",
    "事故が発生した場合、私はSKYNURI飛行教育センターに代わって保険会社から支払われる保険金の範囲内で損害補填を受けることに同意し、SKYNURI飛行教育センターに対する追加の損害賠償請求権を放棄します。ただし、航空機運航者の故意または重大な過失が認められる場合を除きます。",
    "SKYNURI飛行教育センターに対する損害賠償請求権は、事故発生日から1年間行使しない場合、時効により消滅することに同意します。",
    "私は、慣熟（体験）飛行に支障をきたす身体的または精神的な問題がないことを確認します。",
    "本誓約は、いかなる強要または錯誤によるものではなく、本人が内容を十分に理解したうえで、自由意思に基づいて行うものであることを確認します。",
  ],
};

const ui = {
  ko: {
    languageLabel: "언어 선택",
    title: "탑승자 서약서",
    subtitle: "하늘누리 비행교육원 체험비행 탑승 전 아래 내용을 확인하고 작성해주세요.",
    passengerInfo: "탑승자 정보",
    name: "성명",
    namePlaceholder: "홍길동",
    birthDate: "생년월일",
    birthPlaceholder: "예: 19900101",
    birthHelp: "숫자 8자리로 입력해주세요. 예: 19900101",
    phone: "전화번호",
    phonePlaceholder: "01012345678",
    phoneHelp: "하이픈(-) 없이 숫자만 입력해주세요.",
    flightDate: "탑승일",
    address: "주소",
    addressPlaceholder: "주소",
    products: "추가상품",
    productsHelp: "원하는 상품이 있으면 O를 선택해주세요.",
    actionCam: "액션캠 3만원",
    simulator: "시뮬레이터 3만원",
    photoPrint: "사진 인화 1만원",
    marketingConsent: "마케팅 동의",
    reservationSource: "예약경로",
    agreementTitle: "서약 내용",
    agreementHelp: "아래 내용을 읽고 확인해주세요.",
    agreementStored: "선택한 언어의 서약 내용으로 확인하며, 제출 시 한국어·영어·중국어·일본어 전체 문안도 함께 보관됩니다.",
    healthTitle: "건강상태 및 비상연락처",
    healthHelp: "관숙(체험)비행에 지장을 초래할 만한 신체적, 정신적 문제가 없습니다.",
    emergencyName: "비상 시 보호자 성명",
    emergencyNamePlaceholder: "보호자 성명",
    emergencyPhone: "보호자 전화번호",
    bloodType: "혈액형",
    notSelected: "선택 안 함",
    unknownBlood: "모름/미입력",
    confirmationTitle: "확인 및 서명",
    understood: "본인은 선택한 언어의 서약서 내용을 충분히 읽고 이해했으며 자유로운 의사로 동의합니다.",
    saveConsent: "서약서 제출 내용이 탑승 확인 및 증빙 목적으로 저장되는 것에 동의합니다.",
    signatureName: "탑승 서약인 성명",
    signatureNamePlaceholder: "성명을 다시 입력하세요",
    signature: "자필 서명",
    signatureHelp: "손가락 또는 마우스로 직접 서명해주세요.",
    signatureDone: "서명 완료",
    clearSignature: "서명 지우기",
    submit: "서약서 제출",
    submitting: "제출 중...",
    complete: "서약서 제출 완료",
    completeHelp: "탑승자 서약서가 정상 제출되었습니다. 대기실 직원에게 제출 완료 화면을 보여주세요.",
    receiptNo: "접수번호",
    receiptDone: "접수 완료",
    newForm: "새 서약서 작성",
    requiredMissing: "필수 항목을 모두 입력해주세요.",
    healthMissing: "건강상태 확인을 선택해주세요.",
    agreementMissing: "서약 내용 확인 및 저장 동의에 체크해주세요.",
    signatureNameMissing: "탑승 서약인 성명을 입력해주세요.",
    signatureMissing: "자필 서명을 입력해주세요.",
    submitFail: "서약서 제출에 실패했습니다.",
  },
  en: {
    languageLabel: "Language",
    title: "Passenger Agreement",
    subtitle: "Please review and complete this form before your familiarization experience flight with SKYNURI Flight Education Center.",
    passengerInfo: "Passenger Information",
    name: "Full Name",
    namePlaceholder: "Full name",
    birthDate: "Date of Birth",
    birthPlaceholder: "e.g. 19900101",
    birthHelp: "Enter 8 digits. Example: 19900101",
    phone: "Phone Number",
    phonePlaceholder: "01012345678",
    phoneHelp: "Enter numbers only, without hyphens.",
    flightDate: "Flight Date",
    address: "Address",
    addressPlaceholder: "Address",
    products: "Optional Products",
    productsHelp: "Select O for any product you want.",
    actionCam: "Action camera KRW 30,000",
    simulator: "Simulator KRW 30,000",
    photoPrint: "Photo print KRW 10,000",
    marketingConsent: "Marketing consent",
    reservationSource: "How did you hear about us?",
    agreementTitle: "Agreement",
    agreementHelp: "Please read and confirm the agreement below.",
    agreementStored: "You are confirming the agreement in the selected language. Korean, English, Chinese, and Japanese versions will also be stored for recordkeeping.",
    healthTitle: "Health Status and Emergency Contact",
    healthHelp: "I have no physical or mental conditions that would interfere with the familiarization experience flight.",
    emergencyName: "Emergency Contact Name",
    emergencyNamePlaceholder: "Emergency contact name",
    emergencyPhone: "Emergency Contact Phone",
    bloodType: "Blood Type",
    notSelected: "Not selected",
    unknownBlood: "Unknown / not provided",
    confirmationTitle: "Confirmation and Signature",
    understood: "I have fully read and understood the agreement in the selected language and agree of my own free will.",
    saveConsent: "I agree that the submitted agreement may be stored for boarding confirmation and evidentiary purposes.",
    signatureName: "Signer Name",
    signatureNamePlaceholder: "Enter your name again",
    signature: "Handwritten Signature",
    signatureHelp: "Please sign directly with your finger or mouse.",
    signatureDone: "Signed",
    clearSignature: "Clear signature",
    submit: "Submit Agreement",
    submitting: "Submitting...",
    complete: "Agreement Submitted",
    completeHelp: "Your passenger agreement has been submitted successfully. Please show this completion screen to the waiting room staff.",
    receiptNo: "Receipt No.",
    receiptDone: "Submitted",
    newForm: "New Agreement",
    requiredMissing: "Please complete all required fields.",
    healthMissing: "Please confirm your health status.",
    agreementMissing: "Please check both agreement confirmation boxes.",
    signatureNameMissing: "Please enter the signer name.",
    signatureMissing: "Please provide your handwritten signature.",
    submitFail: "Failed to submit the agreement.",
  },
  zh: {
    languageLabel: "语言选择",
    title: "乘客承诺书",
    subtitle: "参加 SKYNURI 飞行教育中心体验飞行前，请确认以下内容并填写表格。",
    passengerInfo: "乘客信息",
    name: "姓名",
    namePlaceholder: "姓名",
    birthDate: "出生日期",
    birthPlaceholder: "例：19900101",
    birthHelp: "请输入8位数字。例：19900101",
    phone: "电话号码",
    phonePlaceholder: "01012345678",
    phoneHelp: "请只输入数字，不要输入连字符。",
    flightDate: "搭乘日期",
    address: "地址",
    addressPlaceholder: "地址",
    products: "附加商品",
    productsHelp: "如需要相关商品，请选择 O。",
    actionCam: "运动相机 30,000韩元",
    simulator: "模拟器 30,000韩元",
    photoPrint: "照片打印 10,000韩元",
    marketingConsent: "营销信息同意",
    reservationSource: "预约途径",
    agreementTitle: "承诺书内容",
    agreementHelp: "请阅读并确认以下内容。",
    agreementStored: "您将确认所选语言的承诺内容。提交时，韩文、英文、中文、日文全文也会一并保存作为记录。",
    healthTitle: "健康状态及紧急联系人",
    healthHelp: "本人不存在会妨碍参加熟悉体验飞行的身体或精神方面的问题。",
    emergencyName: "紧急联系人姓名",
    emergencyNamePlaceholder: "紧急联系人姓名",
    emergencyPhone: "紧急联系人电话",
    bloodType: "血型",
    notSelected: "不选择",
    unknownBlood: "未知/未填写",
    confirmationTitle: "确认及签名",
    understood: "本人已充分阅读并理解所选语言的承诺书内容，并基于自由意愿表示同意。",
    saveConsent: "本人同意提交的承诺书内容为搭乘确认及证明目的而保存。",
    signatureName: "签署人姓名",
    signatureNamePlaceholder: "请再次输入姓名",
    signature: "手写签名",
    signatureHelp: "请用手指或鼠标直接签名。",
    signatureDone: "已签名",
    clearSignature: "清除签名",
    submit: "提交承诺书",
    submitting: "提交中...",
    complete: "承诺书提交完成",
    completeHelp: "乘客承诺书已正常提交。请向候机室工作人员出示此完成画面。",
    receiptNo: "受理编号",
    receiptDone: "已受理",
    newForm: "填写新的承诺书",
    requiredMissing: "请填写所有必填项目。",
    healthMissing: "请选择健康状态确认。",
    agreementMissing: "请勾选承诺内容确认及保存同意。",
    signatureNameMissing: "请输入签署人姓名。",
    signatureMissing: "请提供手写签名。",
    submitFail: "提交承诺书失败。",
  },
  ja: {
    languageLabel: "言語選択",
    title: "搭乗者誓約書",
    subtitle: "SKYNURI飛行教育センターの体験飛行に搭乗する前に、以下の内容を確認して入力してください。",
    passengerInfo: "搭乗者情報",
    name: "氏名",
    namePlaceholder: "氏名",
    birthDate: "生年月日",
    birthPlaceholder: "例：19900101",
    birthHelp: "8桁の数字で入力してください。例：19900101",
    phone: "電話番号",
    phonePlaceholder: "01012345678",
    phoneHelp: "ハイフンなしで数字のみ入力してください。",
    flightDate: "搭乗日",
    address: "住所",
    addressPlaceholder: "住所",
    products: "追加商品",
    productsHelp: "希望する商品がある場合は O を選択してください。",
    actionCam: "アクションカメラ 30,000ウォン",
    simulator: "シミュレーター 30,000ウォン",
    photoPrint: "写真印刷 10,000ウォン",
    marketingConsent: "マーケティング同意",
    reservationSource: "予約経路",
    agreementTitle: "誓約内容",
    agreementHelp: "以下の内容を読み、確認してください。",
    agreementStored: "選択した言語の誓約内容を確認します。提出時には韓国語・英語・中国語・日本語の全文も記録として保存されます。",
    healthTitle: "健康状態および緊急連絡先",
    healthHelp: "私は、慣熟（体験）飛行に支障をきたす身体的または精神的な問題がありません。",
    emergencyName: "緊急連絡先氏名",
    emergencyNamePlaceholder: "緊急連絡先氏名",
    emergencyPhone: "緊急連絡先電話番号",
    bloodType: "血液型",
    notSelected: "選択しない",
    unknownBlood: "不明/未入力",
    confirmationTitle: "確認および署名",
    understood: "私は選択した言語の誓約書内容を十分に読み理解し、自由意思により同意します。",
    saveConsent: "提出した誓約書内容が搭乗確認および証明目的で保存されることに同意します。",
    signatureName: "署名者氏名",
    signatureNamePlaceholder: "氏名をもう一度入力してください",
    signature: "自筆署名",
    signatureHelp: "指またはマウスで直接署名してください。",
    signatureDone: "署名完了",
    clearSignature: "署名を消去",
    submit: "誓約書を提出",
    submitting: "提出中...",
    complete: "誓約書提出完了",
    completeHelp: "搭乗者誓約書が正常に提出されました。待合室スタッフにこの完了画面を提示してください。",
    receiptNo: "受付番号",
    receiptDone: "受付完了",
    newForm: "新しい誓約書を作成",
    requiredMissing: "必須項目をすべて入力してください。",
    healthMissing: "健康状態確認を選択してください。",
    agreementMissing: "誓約内容確認および保存同意にチェックしてください。",
    signatureNameMissing: "署名者氏名を入力してください。",
    signatureMissing: "自筆署名を入力してください。",
    submitFail: "誓約書の提出に失敗しました。",
  },
};

const languageOptions: { value: Language; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
];

function todayText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function digitsOnly(value: string, maxLength?: number) {
  const digits = value.replace(/[^0-9]/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

function normalizeDateDigits(value: string) {
  const digits = digitsOnly(value, 8);
  if (digits.length === 8)
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return value;
}

function toggleArrayValue(array: string[], value: string) {
  return array.includes(value)
    ? array.filter((item) => item !== value)
    : [...array, value];
}

function agreementSnapshotText() {
  return (Object.keys(agreementClauses) as Language[])
    .map((lang) => [
      `[${lang.toUpperCase()} Agreement]`,
      ...agreementClauses[lang].map((clause, index) => `${index + 1}. ${clause}`),
    ].join("\n"))
    .join("\n\n");
}

function sourceLabel(value: string, language: Language) {
  const option = sourceOptions.find((item) => item.value === value);
  return option ? option[language] : value;
}

function bloodTypeLabel(value: string, language: Language) {
  if (value === "모름/미입력") return ui[language].unknownBlood;
  return bloodTypeOptions.find((item) => item.value === value)?.label || value;
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function OptionToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        {["O", "X"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={`h-8 min-w-12 rounded-lg text-sm font-semibold transition ${
              value === item ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function prepareCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    return context;
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event);
    const context = prepareCanvas();
    if (!point || !context) return;
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event);
    const context = prepareCanvas();
    if (!point || !context) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return { canvasRef, start, move, end, clear, hasValue: Boolean(value) };
}

export default function ExperienceConsentPage() {
  const [language, setLanguage] = useState<Language>("ko");
  const [form, setForm] = useState<FormState>(() => ({
    ...initialForm,
    flightDate: todayText(),
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const t = ui[language];
  const clauses = agreementClauses[language];
  const signature = SignaturePad({
    value: form.signatureDataUrl,
    onChange: (value) => update("signatureDataUrl", value),
  });

  const selectedSourceLabels = useMemo(
    () => form.reservationSources.map((source) => sourceLabel(source, language)).join(", "),
    [form.reservationSources, language],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    const requiredMissing =
      !text(form.passengerName) ||
      !text(form.birthDate) ||
      !text(form.phone) ||
      !text(form.flightDate);

    if (requiredMissing) {
      setResult({ ok: false, message: t.requiredMissing });
      return;
    }

    if (!form.healthClear) {
      setResult({ ok: false, message: t.healthMissing });
      return;
    }

    if (!form.understood || !form.saveConsent) {
      setResult({ ok: false, message: t.agreementMissing });
      return;
    }

    if (!text(form.signatureName)) {
      setResult({ ok: false, message: t.signatureNameMissing });
      return;
    }

    if (!form.signatureDataUrl) {
      setResult({ ok: false, message: t.signatureMissing });
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/experience-consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          birthDate: normalizeDateDigits(form.birthDate),
          reservationSource: selectedSourceLabels,
          reservationSources: form.reservationSources,
          reservationSourceValues: form.reservationSources,
          reservationSourceLabels: selectedSourceLabels,
          agreementVersion: AGREEMENT_VERSION,
          agreementLanguage: language,
          agreementText: clauses.join("\n"),
          agreementSnapshot: agreementSnapshotText(),
          signatureDataUrl: form.signatureDataUrl,
          signedAt: new Date().toISOString(),
          signatureMethod: "draw",
        }),
      });
      const data = (await response.json()) as SubmitResult;
      if (!response.ok || !data.ok) throw new Error(data.message || t.submitFail);
      setSubmitted(true);
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : t.submitFail,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#f3f7fc] px-4 py-6 text-slate-900">
        <section className="mx-auto max-w-[520px] rounded-[28px] border border-blue-100 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <div className="grid grid-cols-4 gap-1">
              {languageOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setLanguage(item.value)}
                  className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                    language === item.value ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">
            ✓
          </div>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-blue-500">
            SKYNURI CONSENT
          </p>
          <h1 className="mt-2 text-center text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {t.complete}
          </h1>
          <p className="mt-3 text-center text-sm leading-6 text-slate-600">
            {t.completeHelp}
          </p>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex justify-between gap-4 border-b border-slate-200 pb-2">
              <span>{t.name}</span>
              <strong>{form.passengerName}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-200 py-2">
              <span>{t.flightDate}</span>
              <strong>{form.flightDate}</strong>
            </div>
            <div className="flex justify-between gap-4 pt-2">
              <span>{t.receiptNo}</span>
              <strong>{result?.consentId || t.receiptDone}</strong>
            </div>
          </div>
          <button
            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/20"
            onClick={() => window.location.reload()}
          >
            {t.newForm}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f7fc] px-4 py-4 text-slate-900 sm:py-8">
      <form onSubmit={submit} className="mx-auto max-w-[560px] space-y-4">
        <section className="rounded-[24px] border border-blue-100 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
            {t.languageLabel}
          </p>
          <div className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {languageOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setLanguage(item.value)}
                className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition ${
                  language === item.value ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="bg-gradient-to-br from-blue-600 to-sky-500 px-5 py-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-100">
              SKYNURI
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
              {t.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-blue-50">
              {t.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <Field label={t.name} required>
              <input
                value={form.passengerName}
                onChange={(e) => update("passengerName", e.target.value)}
                placeholder={t.namePlaceholder}
                className="input"
              />
            </Field>
            <Field label={t.birthDate} required>
              <input
                inputMode="numeric"
                maxLength={8}
                value={form.birthDate}
                onChange={(e) => update("birthDate", digitsOnly(e.target.value, 8))}
                placeholder={t.birthPlaceholder}
                className="input"
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-500">{t.birthHelp}</p>
            </Field>
            <Field label={t.phone} required>
              <input
                inputMode="numeric"
                maxLength={11}
                value={form.phone}
                onChange={(e) => update("phone", digitsOnly(e.target.value, 11))}
                placeholder={t.phonePlaceholder}
                className="input"
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-500">{t.phoneHelp}</p>
            </Field>
            <Field label={t.flightDate} required>
              <input
                type="date"
                value={form.flightDate}
                onChange={(e) => update("flightDate", e.target.value)}
                className="input"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.address}>
                <input
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder={t.addressPlaceholder}
                  className="input"
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">{t.products}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{t.productsHelp}</p>
          <div className="mt-4 grid gap-3">
            <OptionToggle label={t.actionCam} value={form.actionCam} onChange={(value) => update("actionCam", value)} />
            <OptionToggle label={t.simulator} value={form.simulator} onChange={(value) => update("simulator", value)} />
            <OptionToggle label={t.photoPrint} value={form.photoPrint} onChange={(value) => update("photoPrint", value)} />
            <OptionToggle label={t.marketingConsent} value={form.marketingConsent} onChange={(value) => update("marketingConsent", value)} />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">{t.reservationSource}</p>
            <div className="grid grid-cols-2 gap-2">
              {sourceOptions.map((source) => {
                const selected = form.reservationSources.includes(source.value);
                return (
                  <button
                    key={source.value}
                    type="button"
                    onClick={() => update("reservationSources", toggleArrayValue(form.reservationSources, source.value))}
                    className={`rounded-2xl border px-3 py-3 text-sm font-medium ${
                      selected ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {selected ? "✓ " : ""}
                    {source[language]}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">{t.agreementTitle}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{t.agreementHelp}</p>
          <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
            {clauses.map((clause, index) => (
              <p key={`${language}-${index}`} className="text-sm leading-6 text-slate-700">
                <span className="mr-1 font-semibold text-slate-950">{index + 1}.</span>
                {clause}
              </p>
            ))}
          </div>
          <p className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
            {t.agreementStored}
          </p>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">{t.healthTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{t.healthHelp}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => update("healthClear", "Yes")}
              className={`rounded-2xl border px-4 py-4 text-sm font-semibold ${
                form.healthClear === "Yes" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => update("healthClear", "No")}
              className={`rounded-2xl border px-4 py-4 text-sm font-semibold ${
                form.healthClear === "No" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-600"
              }`}
            >
              No
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label={t.emergencyName}>
              <input
                value={form.emergencyContactName}
                onChange={(e) => update("emergencyContactName", e.target.value)}
                placeholder={t.emergencyNamePlaceholder}
                className="input"
              />
            </Field>
            <Field label={t.emergencyPhone}>
              <input
                inputMode="numeric"
                maxLength={11}
                value={form.emergencyContactPhone}
                onChange={(e) => update("emergencyContactPhone", digitsOnly(e.target.value, 11))}
                placeholder={t.phonePlaceholder}
                className="input"
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-500">{t.phoneHelp}</p>
            </Field>
            <div className="col-span-2">
              <Field label={t.bloodType}>
                <select
                  value={form.bloodType}
                  onChange={(e) => update("bloodType", e.target.value)}
                  className="input"
                >
                  <option value="">{t.notSelected}</option>
                  {bloodTypeOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {bloodTypeLabel(item.value, language)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">{t.confirmationTitle}</h2>
          <label className="mt-4 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <input
              type="checkbox"
              checked={form.understood}
              onChange={(e) => update("understood", e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
            />
            <span>{t.understood}</span>
          </label>
          <label className="mt-3 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <input
              type="checkbox"
              checked={form.saveConsent}
              onChange={(e) => update("saveConsent", e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
            />
            <span>{t.saveConsent}</span>
          </label>
          <Field label={t.signatureName} required className="mt-4">
            <input
              value={form.signatureName}
              onChange={(e) => update("signatureName", e.target.value)}
              placeholder={t.signatureNamePlaceholder}
              className="input"
            />
          </Field>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {t.signature}<span className="ml-1 text-rose-500">*</span>
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t.signatureHelp}</p>
              </div>
              {form.signatureDataUrl ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {t.signatureDone}
                </span>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <canvas
                ref={signature.canvasRef}
                width={960}
                height={300}
                onPointerDown={signature.start}
                onPointerMove={signature.move}
                onPointerUp={signature.end}
                onPointerCancel={signature.end}
                className="h-[150px] w-full touch-none bg-white"
              />
            </div>
            <button
              type="button"
              onClick={signature.clear}
              className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
            >
              {t.clearSignature}
            </button>
          </div>
        </section>

        {result?.ok === false ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            {result.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/20 disabled:bg-slate-300"
        >
          {submitting ? t.submitting : t.submit}
        </button>
      </form>

      <style jsx>{`
        .input {
          height: 3rem;
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 0 0.95rem;
          font-size: 0.95rem;
          outline: none;
        }
        .input:focus {
          border-color: rgb(37 99 235);
          box-shadow: 0 0 0 4px rgba(191, 219, 254, 0.55);
        }
      `}</style>
    </main>
  );
}

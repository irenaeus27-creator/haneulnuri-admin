function safeText(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

export function digitsOnly(value: unknown) {
  return safeText(value).replace(/\D/g, "");
}

export function formatPhone(value: unknown) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return safeText(value);
}

export function formatAircraft(value: unknown) {
  const raw = safeText(value);
  if (!raw || raw === "-") return raw || "-";

  const parts = raw
    .replace(/[\[\]"']/g, "")
    .split(/[,/|;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(formatSingleAircraft);

  const unique = Array.from(new Set(parts.filter(Boolean)));
  return unique.length ? unique.join(", ") : formatSingleAircraft(raw);
}

function formatSingleAircraft(value: unknown) {
  const raw = safeText(value);
  const upper = raw.toUpperCase();
  const hlc = upper.match(/HL\s*[-_]?\s*C\s*[-_]?\s*(\d{3})/);
  if (hlc) return `HL-C${hlc[1]}`;
  const hl = upper.match(/HL\s*[-_]?\s*(\d{3})/);
  if (hl) return `HL-C${hl[1]}`;
  const c = upper.match(/(^|[^A-Z0-9])C\s*[-_]?\s*(\d{3})([^0-9]|$)/);
  if (c) return `HL-C${c[2]}`;
  return raw;
}

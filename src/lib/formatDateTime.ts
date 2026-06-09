function parseKstParts(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  if (raw.includes("T")) {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);

      return {
        year: kst.getUTCFullYear(),
        month: String(kst.getUTCMonth() + 1).padStart(2, "0"),
        day: String(kst.getUTCDate()).padStart(2, "0"),
        hour: kst.getUTCHours(),
        minute: kst.getUTCMinutes(),
      };
    }
  }

  const dateTimeLike = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{1,2})/);
  if (dateTimeLike) {
    return {
      year: Number(dateTimeLike[1].slice(0, 4)),
      month: dateTimeLike[1].slice(5, 7),
      day: dateTimeLike[1].slice(8, 10),
      hour: Number(dateTimeLike[2]),
      minute: Number(dateTimeLike[3]),
    };
  }

  const dateOnly = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: String(Number(dateOnly[2])).padStart(2, "0"),
      day: String(Number(dateOnly[3])).padStart(2, "0"),
      hour: 0,
      minute: 0,
    };
  }

  const timeOnly = raw.match(/^(\d{1,2}):(\d{1,2})/);
  if (timeOnly) {
    return {
      year: 0,
      month: "00",
      day: "00",
      hour: Number(timeOnly[1]),
      minute: Number(timeOnly[2]),
    };
  }

  return null;
}

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function snapMinutes(totalMinutes: number, intervalMinutes: number) {
  return Math.round(totalMinutes / intervalMinutes) * intervalMinutes;
}

export function formatKstDateTime(value: unknown) {
  const raw = String(value ?? "").trim();
  const parts = parseKstParts(raw);

  if (!parts) return raw || "-";
  if (!parts.year) return minutesToTime(parts.hour * 60 + parts.minute);

  return `${parts.year}-${parts.month}-${parts.day} ${minutesToTime(parts.hour * 60 + parts.minute)}`;
}

export function formatKstDate(value: unknown) {
  const raw = String(value ?? "").trim();
  const parts = parseKstParts(raw);

  if (!parts) return raw || "-";
  if (!parts.year) return "-";

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatKstTime(value: unknown) {
  const raw = String(value ?? "").trim();
  const parts = parseKstParts(raw);

  if (!parts) return raw.slice(0, 5) || "-";

  return minutesToTime(parts.hour * 60 + parts.minute);
}

export function formatBookingDate(value: unknown) {
  return formatKstDate(value);
}

export function formatBookingTime(value: unknown, intervalMinutes = 15) {
  const raw = String(value ?? "").trim();
  const parts = parseKstParts(raw);

  if (!parts) return raw.slice(0, 5) || "-";

  return minutesToTime(snapMinutes(parts.hour * 60 + parts.minute, intervalMinutes));
}

export function emptyIfDash(value: string) {
  return value === "-" ? "" : value;
}

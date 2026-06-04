import { getSupabaseServerClient } from "@/lib/supabase/server";

export type JsonRecord = Record<string, unknown>;

export function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildId(prefix: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export function timeText(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return raw ? raw.slice(0, 5) : "";
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

export function numberOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function toCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

export function toCamelObject(row: JsonRecord) {
  const result: JsonRecord = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    result[toCamelKey(key)] = value ?? "";
  });
  return result;
}

export function mapRows(rows: JsonRecord[] | null | undefined) {
  return (rows || []).map((row) => toCamelObject(row));
}

export function pickAllowed(row: JsonRecord, allowedColumns: string[]) {
  const allowed = new Set(allowedColumns);
  const result: JsonRecord = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!allowed.has(key)) return;
    if (value === undefined) return;
    result[key] = value;
  });
  return result;
}

export async function selectRows(table: string, options?: {
  orderColumn?: string;
  ascending?: boolean;
  limit?: number;
}) {
  const supabase = getSupabaseServerClient();
  let query = supabase.from(table).select("*");

  if (options?.orderColumn) {
    query = query.order(options.orderColumn, { ascending: options.ascending ?? true });
  }
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
  return mapRows(data as JsonRecord[]);
}

export async function insertRow(table: string, row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from(table).insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return toCamelObject(data as JsonRecord);
}

export async function updateRow(table: string, idColumn: string, idValue: string, row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  if (!idValue) throw new Error(`${idColumn} 값이 필요합니다.`);
  const { data, error } = await supabase.from(table).update(row).eq(idColumn, idValue).select("*").single();
  if (error) throw new Error(error.message);
  return toCamelObject(data as JsonRecord);
}

/**
 * Recognise "this database object does not exist yet".
 *
 * Code ships before or after the migration it needs; a call to a function or
 * column that 0014+ adds must degrade to the older behaviour instead of
 * breaking checkout. PostgREST reports a missing RPC as PGRST202, Postgres as
 * 42883 (function) / 42703 (column) / 42P01 (table).
 */
export function isMissingObject(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return (
    e.code === "PGRST202" ||
    e.code === "PGRST204" ||
    e.code === "PGRST205" ||
    e.code === "42883" ||
    e.code === "42703" ||
    e.code === "42P01" ||
    /could not find the (function|table|column)|does not exist/i.test(e.message || "")
  );
}

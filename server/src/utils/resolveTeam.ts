import pool from "../db/pool";

const slugCache = new Map<string, string>();
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveTeamId(raw: any): Promise<string | null> {
  const id: string = Array.isArray(raw) ? raw[0] : String(raw);
  if (!id) return null;

  if (uuidRegex.test(id)) return id;

  if (slugCache.has(id)) {
    return slugCache.get(id)!;
  }

  const result = await pool.query("SELECT id FROM teams WHERE slug = $1", [id]);
  if (result.rows.length === 0) return null;

  const uuid = result.rows[0].id;
  slugCache.set(id, uuid);
  return uuid;
}

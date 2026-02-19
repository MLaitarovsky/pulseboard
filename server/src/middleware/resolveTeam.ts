import { Request, Response, NextFunction } from "express";
import pool from "../db/pool";

// Cache team slugs to avoid repeated DB lookups
const slugCache = new Map<string, string>();

/**
 * Middleware that resolves :teamId param — accepts either UUID or slug.
 * After this runs, req.params.teamId is always the UUID.
 */
export async function resolveTeamId(
  req: Request<{ teamId: string }>,
  res: Response,
  next: NextFunction,
) {
  const teamId = req.params.teamId;
  if (!teamId) return next();

  // If it looks like a UUID, pass through
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(teamId)) return next();

  // Check cache
  if (slugCache.has(teamId)) {
    req.params.teamId = slugCache.get(teamId)!;
    return next();
  }

  // Look up by slug
  try {
    const result = await pool.query("SELECT id FROM teams WHERE slug = $1", [
      teamId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Team not found: ${teamId}` });
    }
    const uuid = result.rows[0].id;
    slugCache.set(teamId, uuid);
    req.params.teamId = uuid;
    next();
  } catch (error) {
    console.error("Error resolving team:", error);
    res.status(500).json({ error: "Failed to resolve team" });
  }
}

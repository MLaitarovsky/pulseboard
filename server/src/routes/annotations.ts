import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { resolveTeamId } from "../utils/resolveTeam";
import { redis } from "../db/redis";

const router = Router();

// GET /api/teams/:teamId/annotations — list annotations (optional ?from=ISO date filter)
router.get("/:teamId/annotations", async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: "Team not found" });

    const { from } = req.query;
    let query = "SELECT * FROM annotations WHERE team_id = $1";
    const params: any[] = [teamId];

    if (from) {
      query += " AND timestamp_target >= $2";
      params.push(from);
    }

    query += " ORDER BY timestamp_target ASC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching annotations:", error);
    res.status(500).json({ error: "Failed to fetch annotations" });
  }
});

// POST /api/teams/:teamId/annotations — create annotation
router.post("/:teamId/annotations", async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: "Team not found" });

    const { content, timestampTarget, userId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Annotation content is required" });
    }

    if (!timestampTarget) {
      return res.status(400).json({ error: "timestampTarget is required" });
    }

    const result = await pool.query(
      `
      INSERT INTO annotations (team_id, user_id, content, timestamp_target)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [teamId, userId || "demo-user", content.trim(), timestampTarget],
    );

    const annotation = result.rows[0];

    // Publish to Redis for real-time broadcast
    try {
      await redis.publish(
        `team:${teamId}:annotations`,
        JSON.stringify({
          type: "new_annotation",
          annotation,
        }),
      );
    } catch (e) {
      console.warn("Redis publish failed for annotation:", e);
    }

    console.log(
      `📌 Annotation added: "${content.trim().substring(0, 40)}..." at ${timestampTarget}`,
    );
    res.status(201).json(annotation);
  } catch (error) {
    console.error("Error creating annotation:", error);
    res.status(500).json({ error: "Failed to create annotation" });
  }
});

// DELETE /api/teams/:teamId/annotations/:annotationId
router.delete(
  "/:teamId/annotations/:annotationId",
  async (req: Request, res: Response) => {
    try {
      const teamId = await resolveTeamId(req.params.teamId);
      if (!teamId) return res.status(404).json({ error: "Team not found" });

      const { annotationId } = req.params;

      const result = await pool.query(
        "DELETE FROM annotations WHERE id = $1 AND team_id = $2 RETURNING id",
        [annotationId, teamId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      // Publish deletion for real-time broadcast
      try {
        await redis.publish(
          `team:${teamId}:annotations`,
          JSON.stringify({
            type: "delete_annotation",
            annotationId,
          }),
        );
      } catch (e) {
        console.warn("Redis publish failed for annotation delete:", e);
      }

      res.json({ deleted: true });
    } catch (error) {
      console.error("Error deleting annotation:", error);
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  },
);

export default router;

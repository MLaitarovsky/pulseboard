import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { resolveTeamId } from "../utils/resolveTeam";
import { fireIncidentNotification } from "../services/notifications";

const router = Router();

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["acknowledged", "investigating"],
  acknowledged: ["investigating", "resolved"],
  investigating: ["resolved"],
  resolved: ["reopened"],
  reopened: ["acknowledged", "investigating"],
};

const VALID_SEVERITIES = ["critical", "high", "medium", "low"];

// GET /api/teams/:teamId/incidents
router.get("/:teamId/incidents", async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: "Team not found" });

    const { status } = req.query;
    let query = "SELECT * FROM incidents WHERE team_id = $1";
    const params: any[] = [teamId];

    if (status) {
      query += " AND status = $2";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching incidents:", error);
    res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

// GET /api/teams/:teamId/incidents/:incidentId
router.get(
  "/:teamId/incidents/:incidentId",
  async (req: Request, res: Response) => {
    try {
      const teamId = await resolveTeamId(req.params.teamId);
      if (!teamId) return res.status(404).json({ error: "Team not found" });

      const incidentId = req.params.incidentId as string;
      const result = await pool.query(
        "SELECT * FROM incidents WHERE id = $1 AND team_id = $2",
        [incidentId, teamId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching incident:", error);
      res.status(500).json({ error: "Failed to fetch incident" });
    }
  },
);

// POST /api/teams/:teamId/incidents — create incident
router.post("/:teamId/incidents", async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: "Team not found" });

    const { title, description, severity, createdBy } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const result = await pool.query(
      `
      INSERT INTO incidents (team_id, title, description, severity, status, created_by)
      VALUES ($1, $2, $3, $4, 'open', $5)
      RETURNING *
    `,
      [
        teamId,
        title,
        description || "",
        severity || "medium",
        createdBy || "system",
      ],
    );

    const incident = result.rows[0];

    await pool.query(
      `
      INSERT INTO incident_timeline (incident_id, action, actor, message)
      VALUES ($1, 'created', $2, $3)
    `,
      [incident.id, createdBy || "system", `Incident reported`],
    );

    res.status(201).json(incident);
  } catch (error) {
    console.error("Error creating incident:", error);
    res.status(500).json({ error: "Failed to create incident" });
  }
});

// PATCH /api/teams/:teamId/incidents/:incidentId — update status
router.patch(
  "/:teamId/incidents/:incidentId",
  async (req: Request, res: Response) => {
    try {
      const teamId = await resolveTeamId(req.params.teamId);
      if (!teamId) return res.status(404).json({ error: "Team not found" });

      const incidentId = req.params.incidentId as string;
      const { status, actor, message } = req.body;

      const current = await pool.query(
        "SELECT * FROM incidents WHERE id = $1 AND team_id = $2",
        [incidentId, teamId],
      );

      if (current.rows.length === 0) {
        return res.status(404).json({ error: "Incident not found" });
      }

      const incident = current.rows[0];
      const validNext = VALID_TRANSITIONS[incident.status] || [];

      if (!validNext.includes(status)) {
        return res.status(400).json({
          error: `Cannot transition from "${incident.status}" to "${status}". Valid: ${validNext.join(", ")}`,
        });
      }

      // Build update query dynamically
      let updateQuery: string;
      if (status === "resolved") {
        updateQuery =
          "UPDATE incidents SET status = $1, updated_at = NOW(), resolved_at = NOW() WHERE id = $2";
      } else if (status === "reopened") {
        updateQuery =
          "UPDATE incidents SET status = $1, updated_at = NOW(), resolved_at = NULL WHERE id = $2";
      } else {
        updateQuery =
          "UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2";
      }

      await pool.query(updateQuery, [status, incidentId]);

      await pool.query(
        `
      INSERT INTO incident_timeline (incident_id, action, actor, message)
      VALUES ($1, $2, $3, $4)
    `,
        [
          incidentId,
          status,
          actor || "demo-user",
          message || `Status changed to ${status}`,
        ],
      );

      fireIncidentNotification(
        {
          teamId,
          type: `incident_${status}` as any,
          incident: {
            id: incidentId,
            title: current.rows[0].title,
            severity: current.rows[0].severity,
            status,
          },
          actor: actor || "demo-user",
          message: `Status changed to ${status}`,
          timestamp: new Date().toISOString(),
        },
        req.app.get("io"),
      ); // Pass Socket.IO instance

      const updated = await pool.query(
        "SELECT * FROM incidents WHERE id = $1",
        [incidentId],
      );
      res.json(updated.rows[0]);
    } catch (error) {
      console.error("Error updating incident status:", error);
      res.status(500).json({ error: "Failed to update incident status" });
    }
  },
);

// PATCH /api/teams/:teamId/incidents/:incidentId/severity — escalate/de-escalate
router.patch(
  "/:teamId/incidents/:incidentId/severity",
  async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const teamId = await resolveTeamId(req.params.teamId);
      if (!teamId) {
        client.release();
        return res.status(404).json({ error: "Team not found" });
      }

      const incidentId = req.params.incidentId as string;
      const { severity, actor, reason } = req.body;

      if (!severity || !VALID_SEVERITIES.includes(severity)) {
        client.release();
        return res.status(400).json({
          error: `Invalid severity "${severity}". Valid: ${VALID_SEVERITIES.join(", ")}`,
        });
      }

      const current = await client.query(
        "SELECT * FROM incidents WHERE id = $1 AND team_id = $2",
        [incidentId, teamId],
      );

      if (current.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: "Incident not found" });
      }

      const incident = current.rows[0];
      const oldSeverity = incident.severity;

      if (oldSeverity === severity) {
        client.release();
        return res
          .status(400)
          .json({ error: `Severity is already ${severity}` });
      }

      if (incident.status === "resolved") {
        client.release();
        return res.status(400).json({
          error:
            "Cannot change severity of a resolved incident. Reopen it first.",
        });
      }

      const oldIdx = VALID_SEVERITIES.indexOf(oldSeverity);
      const newIdx = VALID_SEVERITIES.indexOf(severity);
      const direction = newIdx < oldIdx ? "Escalated" : "De-escalated";

      // ─── Use a TRANSACTION so both succeed or both fail ───
      await client.query("BEGIN");

      await client.query(
        "UPDATE incidents SET severity = $1, updated_at = NOW() WHERE id = $2",
        [severity, incidentId],
      );

      await client.query(
        `
      INSERT INTO incident_timeline (incident_id, action, actor, message)
      VALUES ($1, 'severity_change', $2, $3)
    `,
        [
          incidentId,
          actor || "demo-user",
          `${direction} from ${oldSeverity} to ${severity}${reason ? ": " + reason : ""}`,
        ],
      );

      await client.query("COMMIT");

      const updated = await client.query(
        "SELECT * FROM incidents WHERE id = $1",
        [incidentId],
      );
      console.log(`[severity] ✅ ${incidentId} ${oldSeverity} → ${severity}`);
      res.json(updated.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[severity] ❌ Error:", error.message || error);

      // Detect the CHECK constraint error and give a helpful message
      if (error.message?.includes("incident_timeline_action_check")) {
        return res.status(500).json({
          error:
            'Database constraint error: "severity_change" is not in the allowed actions. Run the migration: ALTER TABLE incident_timeline DROP CONSTRAINT incident_timeline_action_check; then re-add it with severity_change included.',
        });
      }

      res.status(500).json({
        error: `Failed to update severity: ${error.message || "Unknown error"}`,
      });
    } finally {
      client.release();
    }
  },
);

// POST /api/teams/:teamId/incidents/:incidentId/comments — add a comment
router.post(
  "/:teamId/incidents/:incidentId/comments",
  async (req: Request, res: Response) => {
    try {
      const teamId = await resolveTeamId(req.params.teamId);
      if (!teamId) return res.status(404).json({ error: "Team not found" });

      const incidentId = req.params.incidentId as string;
      const { actor, message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Comment message is required" });
      }

      // Verify incident exists
      const check = await pool.query(
        "SELECT id FROM incidents WHERE id = $1 AND team_id = $2",
        [incidentId, teamId],
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ error: "Incident not found" });
      }

      const result = await pool.query(
        `
      INSERT INTO incident_timeline (incident_id, action, actor, message)
      VALUES ($1, 'comment', $2, $3)
      RETURNING *
    `,
        [incidentId, actor || "demo-user", message.trim()],
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  },
);

// GET /api/teams/:teamId/incidents/:incidentId/timeline
router.get(
  "/:teamId/incidents/:incidentId/timeline",
  async (req: Request, res: Response) => {
    try {
      const incidentId = req.params.incidentId as string;
      const result = await pool.query(
        "SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY created_at ASC",
        [incidentId],
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  },
);

// GET /api/teams/:teamId/incidents/:incidentId/postmortem — generate post-mortem report
router.get(
  "/:teamId/incidents/:incidentId/postmortem",
  async (req: Request, res: Response) => {
    try {
      const teamId = await resolveTeamId(req.params.teamId);
      if (!teamId) return res.status(404).json({ error: "Team not found" });

      const incidentId = req.params.incidentId as string;

      const incResult = await pool.query(
        "SELECT * FROM incidents WHERE id = $1 AND team_id = $2",
        [incidentId, teamId],
      );
      if (incResult.rows.length === 0) {
        return res.status(404).json({ error: "Incident not found" });
      }
      const incident = incResult.rows[0];

      const timeResult = await pool.query(
        "SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY created_at ASC",
        [incidentId],
      );
      const timeline = timeResult.rows;

      // Related events during incident window
      let relatedEvents: any[] = [];
      try {
        const eventsQuery = incident.resolved_at
          ? "SELECT source, event_type, title, severity, occurred_at FROM events WHERE team_id = $1 AND occurred_at >= $2 AND occurred_at <= $3 ORDER BY occurred_at ASC LIMIT 50"
          : "SELECT source, event_type, title, severity, occurred_at FROM events WHERE team_id = $1 AND occurred_at >= $2 AND occurred_at <= NOW() ORDER BY occurred_at ASC LIMIT 50";

        const eventsParams = incident.resolved_at
          ? [teamId, incident.created_at, incident.resolved_at]
          : [teamId, incident.created_at];

        const eventsResult = await pool.query(eventsQuery, eventsParams);
        relatedEvents = eventsResult.rows;
      } catch (e) {
        console.warn("Could not fetch related events for postmortem:", e);
      }

      const createdAt = new Date(incident.created_at);
      const resolvedAt = incident.resolved_at
        ? new Date(incident.resolved_at)
        : null;

      const timeToAck = timeline.find((t: any) => t.action === "acknowledged");
      const timeToInv = timeline.find((t: any) => t.action === "investigating");
      const timeToRes = timeline.find((t: any) => t.action === "resolved");

      const ttaMs = timeToAck
        ? new Date(timeToAck.created_at).getTime() - createdAt.getTime()
        : null;
      const ttiMs = timeToInv
        ? new Date(timeToInv.created_at).getTime() - createdAt.getTime()
        : null;
      const ttrMs = timeToRes
        ? new Date(timeToRes.created_at).getTime() - createdAt.getTime()
        : null;

      const fmt = (ms: number | null) => {
        if (ms === null) return "N/A";
        const mins = Math.floor(ms / 60000);
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ${mins % 60}m`;
        return `${Math.floor(hours / 24)}d ${hours % 24}h`;
      };

      const totalMs = resolvedAt
        ? resolvedAt.getTime() - createdAt.getTime()
        : Date.now() - createdAt.getTime();
      const sevChanges = timeline.filter(
        (t: any) => t.action === "severity_change",
      );
      const comments = timeline.filter((t: any) => t.action === "comment");
      const errorEvents = relatedEvents.filter(
        (e: any) => e.severity === "error" || e.severity === "critical",
      );

      const postmortem = {
        incident: {
          id: incident.id,
          title: incident.title,
          description: incident.description,
          severity: incident.severity,
          status: incident.status,
          createdAt: incident.created_at,
          resolvedAt: incident.resolved_at,
          createdBy: incident.created_by,
        },
        metrics: {
          timeToAcknowledge: fmt(ttaMs),
          timeToInvestigate: fmt(ttiMs),
          timeToResolve: fmt(ttrMs),
          totalDuration: fmt(totalMs),
          severityChanges: sevChanges.length,
          timelineEntries: timeline.length,
          commentsCount: comments.length,
          relatedEventsCount: relatedEvents.length,
        },
        timeline: timeline.map((t: any) => ({
          action: t.action,
          actor: t.actor,
          message: t.message,
          timestamp: t.created_at,
        })),
        relatedEvents: relatedEvents.map((e: any) => ({
          source: e.source,
          type: e.event_type,
          title: e.title,
          severity: e.severity,
          timestamp: e.occurred_at,
        })),
        template: {
          summary: `## Incident Post-Mortem: ${incident.title}\n\n**Severity:** ${incident.severity.toUpperCase()}\n**Status:** ${incident.status}\n**Duration:** ${fmt(totalMs)}\n**Created:** ${new Date(incident.created_at).toLocaleString()}\n${incident.resolved_at ? `**Resolved:** ${new Date(incident.resolved_at).toLocaleString()}` : "**Status:** Ongoing"}\n`,
          impactSection: `### Impact\n\n${incident.description || "_No description provided._"}\n\n- **Related Events:** ${relatedEvents.length} events during incident window\n- **Error Events:** ${errorEvents.length} errors detected\n`,
          timelineSection: `### Timeline\n\n${timeline.map((t: any) => `- **${new Date(t.created_at).toLocaleTimeString()}** — ${t.action.toUpperCase()}: ${t.message} _(${t.actor})_`).join("\n")}\n`,
          metricsSection: `### Response Metrics\n\n| Metric | Value |\n|--------|-------|\n| Time to Acknowledge | ${fmt(ttaMs)} |\n| Time to Investigate | ${fmt(ttiMs)} |\n| Time to Resolve | ${fmt(ttrMs)} |\n| Total Duration | ${fmt(totalMs)} |\n`,
          rootCause: `### Root Cause\n\n_Describe the root cause of the incident here._\n`,
          actionItems: `### Action Items\n\n- [ ] _Add preventative measures_\n- [ ] _Add monitoring improvements_\n- [ ] _Add documentation updates_\n`,
          lessonsLearned: `### Lessons Learned\n\n#### What went well\n- _Add positives_\n\n#### What could be improved\n- _Add improvements_\n`,
        },
      };

      res.json(postmortem);
    } catch (error) {
      console.error("Error generating post-mortem:", error);
      res.status(500).json({ error: "Failed to generate post-mortem" });
    }
  },
);

export default router;

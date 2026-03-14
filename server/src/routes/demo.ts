import { Router, Request, Response } from 'express';
import { startDemoMode, stopDemoMode, isDemoRunning, simulateIncidentLifecycle } from '../services/demo';
import { resolveTeamId } from '../utils/resolveTeam';

const router = Router();

// GET /api/demo/status
router.get('/status', (_req: Request, res: Response) => {
  res.json({ running: isDemoRunning() });
});

// POST /api/demo/start
router.post('/start', async (req: Request, res: Response) => {
  try {
    const teamSlug = req.body.teamId || 'acme-eng';
    const teamId = await resolveTeamId(teamSlug);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    if (isDemoRunning()) {
      return res.json({ status: 'already_running' });
    }

    const io = req.app.get('io');
    startDemoMode(teamId, teamSlug, io, req.body.interval || 4000);
    res.json({ status: 'started' });
  } catch (error) {
    console.error('Error starting demo:', error);
    res.status(500).json({ error: 'Failed to start demo' });
  }
});

// POST /api/demo/stop
router.post('/stop', (_req: Request, res: Response) => {
  stopDemoMode();
  res.json({ status: 'stopped' });
});

// POST /api/demo/incident — trigger a single incident lifecycle simulation
router.post('/incident', async (req: Request, res: Response) => {
  try {
    const teamSlug = req.body.teamId || 'acme-eng';
    const teamId = await resolveTeamId(teamSlug);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    const io = req.app.get('io');
    simulateIncidentLifecycle(teamId, teamSlug, io);
    res.json({ status: 'incident_simulation_started' });
  } catch (error) {
    console.error('Error simulating incident:', error);
    res.status(500).json({ error: 'Failed to simulate incident' });
  }
});

export default router;

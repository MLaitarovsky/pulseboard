// Run: cd server && npx tsx db/migrations/add_notifications.ts

import pool from '../pool';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔧 Adding notification tables...');

    await client.query(`
      -- Webhook configurations per team
      CREATE TABLE IF NOT EXISTS webhook_configs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(2000) NOT NULL,
        events TEXT[] NOT NULL DEFAULT '{"incident_created","incident_resolved","incident_escalated"}',
        enabled BOOLEAN DEFAULT true,
        secret VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_configs_team
        ON webhook_configs (team_id, enabled);

      -- Notification log
      CREATE TABLE IF NOT EXISTS notification_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        channel VARCHAR(50) NOT NULL,
        recipient VARCHAR(500),
        subject VARCHAR(500),
        body TEXT,
        metadata JSONB DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notification_log_team
        ON notification_log (team_id, created_at DESC);
    `);

    console.log('✅ Notification tables created');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));

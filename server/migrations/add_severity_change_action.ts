// Run this from your server directory:
//   npx tsx migrations/add_severity_change_action.ts
// OR:
//   npx ts-node migrations/add_severity_change_action.ts

import pool from '../src/db/pool';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔧 Checking current constraint...');

    // Check if the constraint exists and what it allows
    const check = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conname = 'incident_timeline_action_check'
    `);

    if (check.rows.length > 0) {
      console.log('📋 Current constraint:', check.rows[0].def);

      if (check.rows[0].def.includes('severity_change')) {
        console.log('✅ severity_change already in constraint. Nothing to do!');
        return;
      }

      console.log('🗑️  Dropping old constraint...');
      await client.query('ALTER TABLE incident_timeline DROP CONSTRAINT incident_timeline_action_check');
    } else {
      console.log('⚠️  No existing constraint found, will create fresh');
    }

    console.log('➕ Adding updated constraint with severity_change...');
    await client.query(`
      ALTER TABLE incident_timeline ADD CONSTRAINT incident_timeline_action_check
        CHECK (action IN (
          'created',
          'acknowledged',
          'investigating',
          'resolved',
          'reopened',
          'comment',
          'severity_change'
        ))
    `);

    // Verify
    const verify = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conname = 'incident_timeline_action_check'
    `);
    console.log('✅ Updated constraint:', verify.rows[0]?.def);
    console.log('🎉 Migration complete! Severity changes will now work.');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));

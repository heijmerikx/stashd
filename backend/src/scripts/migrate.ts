import { runMigrations, getMigrationStatus } from '../db/migrator.js';
import { pool } from '../db/index.js';

async function main() {
  const args = process.argv.slice(2);
  const showStatus = args.includes('--status');

  try {
    if (showStatus) {
      const status = await getMigrationStatus();

      console.log('\n=== Migration Status ===\n');

      if (status.applied.length > 0) {
        console.log('Applied migrations:');
        for (const m of status.applied) {
          console.log(`  ✓ ${String(m.version).padStart(3, '0')}_${m.name} (${m.applied_at.toISOString()})`);
        }
      } else {
        console.log('No migrations applied yet.');
      }

      if (status.pending.length > 0) {
        console.log('\nPending migrations:');
        for (const m of status.pending) {
          console.log(`  ○ ${String(m.version).padStart(3, '0')}_${m.name}`);
        }
      } else {
        console.log('\nNo pending migrations.');
      }

      console.log('');
    } else {
      await runMigrations();
    }
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

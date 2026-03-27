// MongoDB shell script to remove old backfill migration state
// Run this in MongoDB shell or MongoDB Compass console:
// mongosh < scripts/cleanup-old-backfill-migration.mongodb.js

use polyscope

const result = db.migrationstates.deleteOne({ 
  key: '2026-03-27-approved-reason-backfill-v1' 
})

if (result.deletedCount > 0) {
  print('✓ Deleted old migration record: 2026-03-27-approved-reason-backfill-v1')
  print('Old backfill v1 migration cleared. Next deploy will run backfill v2.')
} else {
  print('ℹ No old migration record found.')
}

print('Done.')

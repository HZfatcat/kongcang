// Force-stop the running sync by setting isRunning to false
// Then trigger a new sync with correct dates
const { SyncService } = require('./dist/modules/sync/sync.service');
const { Test } = require('@nestjs/testing');
const { AppModule } = require('./app.module');

async function main() {
  // Get the running app instance
  const app = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  
  const syncService = app.get(SyncService);
  
  // Reset the running sync if any
  if (syncService.progress?.isRunning) {
    console.log('Stopping running sync...');
    syncService.progress.isRunning = false;
    syncService.progress.note = '手动停止';
  }
  
  // Trigger new sync
  console.log('Triggering sync from 2026-01-01 to 2026-05-14...');
  const startDate = new Date('2026-01-01T00:00:00.000Z');
  const endDate = new Date('2026-05-14T23:59:59.000Z');
  
  const result = syncService.triggerUdescSync({
    startDate,
    endDate,
    resetCursor: true
  });
  
  console.log('Result:', JSON.stringify(result, null, 2));
  await app.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

require('dotenv').config({ path: 'D:/kefumonitor/.env' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$connect()
  .then(() => { console.log('DB OK'); process.exit(0); })
  .catch(e => { console.error('DB FAIL:', e.message); process.exit(1); });
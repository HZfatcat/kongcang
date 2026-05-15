const http = require('http');
const opts = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/udesc/heatmap?startDate=2026-04-10T00:00:00.000Z&endDate=2026-05-13T23:59:59.999Z',
  method: 'GET'
};
const req = http.request(opts, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const j = JSON.parse(d);
    console.log('total:', j.total);
    console.log('dateRange:', JSON.stringify(j.dateRange));
    if (j.data && j.data.length > 0) {
      let sum = j.data.reduce((a, w) => a + parseInt(w.count || 0), 0);
      console.log('sum of data counts:', sum);
    } else if (j.matrix) {
      let sum = 0;
      for (const row of j.matrix) for (const val of row) sum += val;
      console.log('sum of matrix:', sum);
    }
  });
});
req.on('error', e => console.log('error:', e.message));
req.end();

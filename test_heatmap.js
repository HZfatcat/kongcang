const http = require('http');
const url = 'http://localhost:3000/api/v1/udesc/heatmap?startDate=2026-04-10&endDate=2026-04-30';
http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const j = JSON.parse(data);
    console.log('dateRange:', JSON.stringify(j.dateRange));
    console.log('total:', j.total);
  });
}).on('error', (e) => console.error('Error:', e.message));

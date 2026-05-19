const http = require('http');

// Trigger sync
console.log('Triggering sync...');
const postReq = http.request('http://localhost:3000/api/v1/sync/run', { method: 'POST' }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log('Sync triggered:', data);
        
        // Wait and check progress
        setTimeout(() => {
            const getReq = http.get('http://localhost:3000/api/v1/sync/summary', (res2) => {
                let data2 = '';
                res2.on('data', c => data2 += c);
                res2.on('end', () => {
                    console.log('Summary:', data2);
                });
            });
            getReq.on('error', console.error);
        }, 15000);
    });
});
postReq.on('error', console.error);
postReq.end();

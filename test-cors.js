import fetch from 'node-fetch';
fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Origin': 'https://example.com',
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test'
  },
  body: JSON.stringify({model: 'test', messages: []})
}).then(res => {
  console.log('Status', res.status);
  console.log('Headers', res.headers.raw());
}).catch(console.error);

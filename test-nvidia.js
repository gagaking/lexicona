import fetch from 'node-fetch'; // wait, node 18+ has fetch
fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': 'http://localhost:3000'
  },
  body: JSON.stringify({
    model: 'meta/llama-3.2-90b-vision-instruct',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }
        ]
      }
    ],
    max_tokens: 512
  })
}).then(res => {
  console.log('Status', res.status);
  console.log('Headers', res.headers.raw());
  return res.text();
}).then(console.log).catch(console.error);

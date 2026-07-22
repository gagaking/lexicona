import http from 'http';
const html = `
<!DOCTYPE html>
<html><body>
<script>
fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test' },
  body: JSON.stringify({model: 'test'})
}).then(res => console.log('success!', res.status)).catch(err => console.error('fetch failure:', err));
</script>
</body></html>
`;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});
server.listen(3002);
console.log('ready');

const crypto = require('crypto');

function sign(method, path, sk, ts) {
    const message = `${method}\n${path}\n${ts}`;
    const signature = crypto.createHmac('sha256', sk).update(message).digest('hex');
    return { ts, signature };
}

console.log(sign("POST", "/v1/openapi/chat", "test_sk", "123"));

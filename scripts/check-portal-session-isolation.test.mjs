import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const server = createServer((req, res) => {
  if (req.url === '/api/version') {
    res.setHeader('Set-Cookie', 'CF_Authorization=service; Path=/; HttpOnly');
    res.end('{}');
  } else {
    res.statusCode = req.headers.cookie?.includes('CF_Authorization=reviewer') ? 200 : 302;
    res.end('{}');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const host = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  const reviewer = await browser.newContext();
  const service = await browser.newContext();
  const login = () => reviewer.addCookies([{ name: 'CF_Authorization', value: 'reviewer', url: host }]);
  await login();
  assert.equal((await reviewer.request.get(host + '/api/recent-issues')).status(), 200);
  await reviewer.request.get(host + '/api/version');
  assert.equal((await reviewer.request.get(host + '/api/recent-issues')).status(), 302);
  await login();
  await service.request.get(host + '/api/version');
  assert.equal((await reviewer.request.get(host + '/api/recent-issues')).status(), 200);
  const page = await reviewer.newPage();
  assert.equal((await page.goto(host + '/api/recent-issues')).status(), 200);
  console.log('PASS: shared service response replaces reviewer cookie; isolated context preserves reviewer API and browser access. Synthetic cookie regression only.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

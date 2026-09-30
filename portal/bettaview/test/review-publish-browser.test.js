import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {draftStorageKey, newReviewDraft} from '../src/review-drafts.js';

test('Publish sends the selected review and preserves drafts until GitHub confirms it',
  {skip: !process.env.DEOS_BROWSER_EXECUTABLE}, async () => {
    const {PuppeteerNode} = await import('@cloudflare/puppeteer/internal/node/PuppeteerNode.js');
    const prUrl = 'https://github.com/example/reviews/pull/1';
    const headSha = 'a'.repeat(40);
    const received = [];
    let uncertain = false;
    let reconciling = false;
    let reconciledStatus = null;
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      server: {host: '127.0.0.1', port: 0},
      plugins: [{name: 'review-api-fixture', configureServer(vite) {
        vite.middlewares.use('/api', async (request, response) => {
          response.setHeader('Content-Type', 'application/json');
          if (request.url.startsWith('/pr?')) {
            response.end(JSON.stringify({url: prUrl, headSha, repository: 'example/reviews',
              number: 1, title: 'Review click regression', state: 'open',
              files: [{path: 'README.md', html: '<p>Review fixture</p>', changedLines: [1],
                mermaidBlocks: [], additions: 1, deletions: 0}], threads: [],
              reviewContinuation: {runId: 'test-run', readiness: 'ready', goalState: 'In Progress',
                ...(reconciledStatus ? {status: reconciledStatus} : {})}}));
          } else if (request.url === '/review-continuations/publish') {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            received.push(JSON.parse(Buffer.concat(chunks).toString()));
            response.end(JSON.stringify({continuation: reconciling ? {
              reviewId: received.at(-1).reviewId, outcome: 'active',
              github: {label: 'GitHub review', status: 'publishing', complete: false},
              linear: {label: 'Linear', status: 'not_started', complete: false}, actions: [],
            } : uncertain ? {
              reviewId: received.at(-1).reviewId, outcome: 'host_check_required',
              github: {label: 'GitHub review', status: 'host_check_required', complete: false},
              linear: {label: 'Linear', status: 'not_started', complete: false},
              actions: ['reload'], safeError: {code: 'github_host_check_required',
                message: 'The GitHub result could not be verified. Check the host before continuing.'},
            } : {outcome: 'continued',
              github: {status: 'published', complete: true}, linear: {status: 'continued', complete: true}}}));
          } else if (reconciling && request.url.startsWith('/review-continuations?')) {
            reconciledStatus = {reviewId: received.at(-1).reviewId, outcome: 'continued', continued: true,
              github: {label: 'GitHub review', status: 'done', complete: true},
              linear: {label: 'Linear', status: 'done', complete: true}, actions: [],
              parts: [{partId: 'reply:reconciled-reply', contentItemId: 'reconciled-reply', status: 'done',
                url: 'https://github.com/example/reviews/pull/1#discussion_r42'}]};
            response.end(JSON.stringify(reconciledStatus));
          } else {
            response.statusCode = 404;
            response.end(JSON.stringify({error: 'unexpected_fixture_request'}));
          }
        });
      }}],
    });
    const puppeteer = new PuppeteerNode({isPuppeteerCore: true});
    let browser;
    try {
      await server.listen();
      const address = server.httpServer.address();
      browser = await puppeteer.launch({executablePath: process.env.DEOS_BROWSER_EXECUTABLE, headless: true});
      for (const event of ['COMMENT', 'APPROVE', 'REQUEST_CHANGES']) {
        const page = await browser.newPage();
        const draft = {...newReviewDraft(prUrl, headSha), event, reviewBody: 'Saved summary',
          items: [{kind: 'reply', path: 'README.md', body: 'Saved reply', commentId: 42,
            clientSubmissionId: 'saved-reply'}]};
        const key = draftStorageKey(prUrl, headSha);
        await page.evaluateOnNewDocument(({key, draft}) => localStorage.setItem(key, JSON.stringify(draft)), {key, draft});
        await page.goto(`http://127.0.0.1:${address.port}/?pr=${encodeURIComponent(prUrl)}`);
        await page.waitForSelector('#publish-review', {visible: true});
        const published = page.waitForResponse(response => response.url().endsWith('/api/review-continuations/publish'));
        await page.click('#publish-review');
        await published;
        assert.equal(received.at(-1).event, event);
        assert.equal(received.at(-1).reviewId, draft.reviewId);
        assert.deepEqual(received.at(-1).comments, draft.items);
        await page.waitForFunction(key => localStorage.getItem(key) === null, {}, key);
        await page.close();
      }
      uncertain = true;
      const page = await browser.newPage();
      const draft = {...newReviewDraft(prUrl, headSha), event: 'COMMENT', reviewBody: 'Keep this summary',
        items: [{kind: 'reply', path: 'README.md', body: 'Keep this reply', commentId: 42,
          clientSubmissionId: 'uncertain-reply'}]};
      const key = draftStorageKey(prUrl, headSha);
      await page.evaluateOnNewDocument(({key, draft}) => localStorage.setItem(key, JSON.stringify(draft)), {key, draft});
      await page.goto(`http://127.0.0.1:${address.port}/?pr=${encodeURIComponent(prUrl)}`);
      await page.waitForSelector('#publish-review', {visible: true});
      await page.click('#publish-review');
      await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('could not be verified'));
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), draft);
      assert.equal(await page.$eval('#review-body', element => element.value), 'Keep this summary');
      assert.match(await page.$eval('#pending-review-count', element => element.textContent), /1 unpublished comment/);
      assert.doesNotMatch(await page.$eval('#notice', element => element.textContent), /GitHub saved/);
      assert.equal(received.at(-1).reviewId, draft.reviewId);
      await page.close();

      reconciling = true;
      const recoveredPage = await browser.newPage();
      const recoveredDraft = {...draft, reviewId: newReviewDraft(prUrl, headSha).reviewId,
        items: [{...draft.items[0], clientSubmissionId: 'reconciled-reply', startLine: 1, endLine: 1}]};
      await recoveredPage.evaluateOnNewDocument(({key, draft}) => localStorage.setItem(key, JSON.stringify(draft)),
        {key, draft: recoveredDraft});
      await recoveredPage.goto(`http://127.0.0.1:${address.port}/?pr=${encodeURIComponent(prUrl)}`);
      await recoveredPage.waitForSelector('#publish-review', {visible: true});
      const before = received.length;
      await recoveredPage.click('#publish-review');
      await recoveredPage.waitForFunction(() => document.querySelector('#threads')?.textContent.includes('Already published'));
      assert.equal(received.length, before + 1);
      assert.match(await recoveredPage.$eval('#pending-review-count', element => element.textContent), /0 unpublished comments/);
      assert.equal(await recoveredPage.$eval('#pending-review-bar', element => element.hidden), true);
      assert.equal(await recoveredPage.evaluate(key => JSON.parse(localStorage.getItem(key)).items[0].alreadyPublishedUrl, key),
        reconciledStatus.parts[0].url);
      await recoveredPage.reload();
      await recoveredPage.waitForFunction(() => document.querySelector('#threads')?.textContent.includes('Already published'));
      assert.equal(received.length, before + 1);
      assert.equal(await recoveredPage.$eval('#pending-review-bar', element => element.hidden), true);
      await recoveredPage.close();
    } finally {
      try {await browser?.close();} finally {await server.close();}
    }
  });

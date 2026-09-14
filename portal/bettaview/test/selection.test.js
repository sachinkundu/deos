import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locateSelectedText } from '../shared/selection.js';
import { locateSelectedText as cloud } from '../worker/github-core.js';
import { locateSelectedText as local } from '../server/github.js';

test('browser, cloud and local publication use the same selection matcher', () => {
  assert.equal(cloud, locateSelectedText);
  assert.equal(local, locateSelectedText);
});

test('matches GitHub-rendered PR 133 paragraphs across hidden link destinations', () => {
  const source = readFileSync(new URL('fixtures/pr133-design.md', import.meta.url), 'utf8');
  const selections = JSON.parse(readFileSync(new URL('fixtures/pr133-rendered-selections.json', import.meta.url)));
  assert.deepEqual(selections.map(s => [s.startLine, s.endLine]), [[208,215], [217,223]]);
  for (const selection of selections) {
    assert.deepEqual(locateSelectedText(source, selection.text), {
      startLine: selection.startLine, endLine: selection.endLine, selectedText: selection.selectedText,
    });
  }
});

test('matches decoded entities, nested formatting, links and reference links on exact source lines', () => {
  const source = '# Title\n\nUse **bold [labels](https://example.com/hidden)** &amp; [references][ref] now.\n\n[ref]: https://example.com/private-destination\n';
  assert.deepEqual(locateSelectedText(source, 'Use bold labels & references now.'), {
    startLine: 3, endLine: 3, selectedText: 'Use bold labels & references now.',
  });
});

test('matches across list entries without including Markdown list numbering', () => {
  assert.deepEqual(locateSelectedText('1. First item\n2. Second **item**\n', 'First item Second item'), {
    startLine: 1, endLine: 2, selectedText: 'First item Second item',
  });
});

test('preserves exact code content and multiline source locations', () => {
  assert.deepEqual(locateSelectedText('Intro\n\n```text\nA --> B\nC < D\n```\n', 'A --> B\nC < D'), {
    startLine: 4, endLine: 5, selectedText: 'A --> B C < D',
  });
});

test('rejects ambiguity and changed wording even when draft supplies plausible lines', () => {
  const source = '[same passage](https://one.example)\n\n[same passage](https://two.example)';
  assert.throws(() => locateSelectedText(source, 'same passage'), /ambiguous/);
  assert.equal(locateSelectedText(source, 'same passage', {startLine:3,endLine:3}).startLine, 3);
  assert.throws(() => locateSelectedText(source, 'changed passage', {startLine:3,endLine:3}), /Could not locate/);
});

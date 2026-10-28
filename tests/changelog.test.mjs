import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { versionNotes, packageChangelog, CHANGELOG_FILES } from '../scripts/changelog.mjs';

test('selects the requested version, not the newest or adjacent version', () => {
  const text = '# Changelog\n\n## 0.2.0\n\nNew feature.\n\n## 0.1.0\n\nInitial release.\n';
  assert.equal(versionNotes(text, '0.1.0'), 'Initial release.');
  assert.equal(versionNotes(text, '0.2.0'), 'New feature.');
  assert.throws(() => versionNotes(text, '0.3.0'), /exactly one/);
});
test('rejects duplicate, blank or oversized release sections', () => {
  assert.throws(() => versionNotes('## 0.1.0\nA\n## 0.1.0\nB', '0.1.0'), /exactly one/);
  assert.throws(() => versionNotes('## 0.1.0\n\n', '0.1.0'), /1–2000/);
  assert.throws(() => versionNotes('## 0.1.0\n'+ 'x'.repeat(2001), '0.1.0'), /1–2000/);
});
test('reads all localized summaries from packaged bytes and fails on missing or invalid content', () => {
  const files = Object.fromEntries(Object.entries(CHANGELOG_FILES).map(([locale, name]) => [name, Buffer.from(`## 0.1.0\n${locale} release.`)]));
  const notes = packageChangelog(files, '0.1.0');
  assert.equal(notes['zh-TW'], 'zh-TW release.');
  files['CHANGELOG.zh-TW.md'] = Buffer.from('## 0.2.0\nWrong version.');
  assert.throws(() => packageChangelog(files, '0.1.0'), /exactly one/);
  delete files['CHANGELOG.zh-TW.md'];
  assert.throws(() => packageChangelog(files, '0.1.0'), /Missing/);
  files['CHANGELOG.zh-TW.md'] = Buffer.from([255]);
  assert.throws(() => packageChangelog(files, '0.1.0'), /encoded data/);
});

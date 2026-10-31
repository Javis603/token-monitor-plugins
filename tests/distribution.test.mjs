import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stageDistribution } from '../scripts/distribution.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-dist-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), target = path.join(root, 'target');
  fs.mkdirSync(source);
  function build(version, content = version) {
    const filename = `magpie-routes-${version}.tmplugin`, bytes = Buffer.from(content);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(source, filename), bytes);
    fs.writeFileSync(path.join(source, 'packages.json'), JSON.stringify({ localOnly: false, packages: [{ id: 'magpie-routes', version, filename, sha256 }] }));
    fs.writeFileSync(path.join(source, 'catalog.json'), JSON.stringify({ format: 1, plugins: [{ id: 'magpie-routes', versions: [{ version, sha256 }] }] }));
  }
  return { source, target, build, index: () => JSON.parse(fs.readFileSync(path.join(target, 'catalog.json'))) };
}
test('initial publication, identical rerun and new version preserve old packages and catalog entries', t => {
  const f = fixture(t);
  f.build('0.1.0'); stageDistribution(f.source, f.target);
  const first = fs.readFileSync(path.join(f.target, 'magpie-routes-0.1.0.tmplugin'));
  stageDistribution(f.source, f.target);
  f.build('0.2.0'); stageDistribution(f.source, f.target);
  assert.deepEqual(f.index().plugins[0].versions.map(v => v.version), ['0.2.0', '0.1.0']);
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'magpie-routes-0.1.0.tmplugin')), first);
});
test('changed bytes under a published version fail without changing the catalog or package', t => {
  const f = fixture(t);
  f.build('0.1.0'); stageDistribution(f.source, f.target);
  const before = f.index();
  f.build('0.1.0', 'changed');
  assert.throws(() => stageDistribution(f.source, f.target), /immutable/);
  assert.deepEqual(f.index(), before);
  assert.equal(fs.readFileSync(path.join(f.target, 'magpie-routes-0.1.0.tmplugin'), 'utf8'), '0.1.0');
});
test('corrupt and local-only build outputs cannot be published', t => {
  const f = fixture(t); f.build('0.1.0');
  fs.writeFileSync(path.join(f.source, 'magpie-routes-0.1.0.tmplugin'), 'tampered');
  assert.throws(() => stageDistribution(f.source, f.target), /hash mismatch/);
  assert.equal(fs.existsSync(f.target), false);
  f.build('0.1.0');
  const file = path.join(f.source, 'packages.json'), built = JSON.parse(fs.readFileSync(file));
  built.localOnly = true; fs.writeFileSync(file, JSON.stringify(built));
  assert.throws(() => stageDistribution(f.source, f.target), /Local-only/);
});

test('the 33rd release retains the newest 32 versions and leaves evicted packages immutable', t => {
  const f = fixture(t);
  for (let version = 1; version <= 33; version++) {
    f.build(`0.${version}.0`); stageDistribution(f.source, f.target);
  }
  const versions = f.index().plugins[0].versions;
  assert.equal(versions.length, 32);
  assert.equal(versions[0].version, '0.33.0');
  assert.equal(versions.at(-1).version, '0.2.0');
  const file = path.join(f.target, 'magpie-routes-0.1.0.tmplugin');
  assert.equal(fs.readFileSync(file, 'utf8'), '0.1.0');
  const before = fs.readFileSync(path.join(f.target, 'catalog.json'));
  f.build('0.1.0', 'changed evicted package');
  assert.throws(() => stageDistribution(f.source, f.target), /refusing to overwrite/);
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'catalog.json')), before);
  assert.equal(fs.readFileSync(file, 'utf8'), '0.1.0');
});

test('an incoming release outside the retained range fails before any distribution writes', t => {
  const f = fixture(t);
  for (let version = 2; version <= 33; version++) {
    f.build(`0.${version}.0`); stageDistribution(f.source, f.target);
  }
  const before = fs.readFileSync(path.join(f.target, 'catalog.json'));
  const files = fs.readdirSync(f.target).sort();
  f.build('0.1.1');
  assert.throws(() => stageDistribution(f.source, f.target), /outside the newest 32 catalog versions/);
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'catalog.json')), before);
  assert.deepEqual(fs.readdirSync(f.target).sort(), files);
});

test('history uses SemVer order for patch, minor and prerelease versions', t => {
  const f = fixture(t);
  for (const version of ['0.9.0', '0.10.0', '0.10.1', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0']) {
    f.build(version); stageDistribution(f.source, f.target);
  }
  f.build('0.10.2'); stageDistribution(f.source, f.target);
  assert.deepEqual(f.index().plugins[0].versions.map(v => v.version), [
    '1.0.0', '1.0.0-beta.10', '1.0.0-beta.2', '0.10.2', '0.10.1', '0.10.0', '0.9.0'
  ]);
});

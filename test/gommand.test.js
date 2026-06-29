import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../bin/gommand.js', import.meta.url).pathname;

let tmpDir;

function gommand(...args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    env: { ...process.env, GOMMAND_DIR: tmpDir },
    encoding: 'utf8',
  });
}

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'gommand-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test('list is empty initially', () => {
  const r = gommand('list');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No commands saved/);
});

test('add saves a command', () => {
  const r = gommand('add', 'echo hello', 'as', 'greet');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Saved.*greet/);
});

test('list shows saved command', () => {
  gommand('add', 'echo hello', 'as', 'greet');
  const r = gommand('list');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /greet/);
});

test('show prints command details', () => {
  gommand('add', 'echo hello', 'as', 'greet');
  const r = gommand('show', 'greet');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /echo hello/);
  assert.match(r.stdout, /path ok/i);
});

test('test passes for valid command', () => {
  gommand('add', 'echo hello', 'as', 'greet');
  const r = gommand('test', 'greet');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /OK/);
});

test('test fails for unknown command', () => {
  const r = gommand('test', 'nope');
  assert.notEqual(r.status, 0);
});

test('run executes the command', () => {
  gommand('add', 'echo hello', 'as', 'greet');
  const r = gommand('greet');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /hello/);
});

test('run appends extra args via --', () => {
  gommand('add', 'echo', 'as', 'say');
  const r = gommand('say', '--', 'world');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /world/);
});

test('rename changes the key', () => {
  gommand('add', 'echo hi', 'as', 'hi');
  const r = gommand('rename', 'hi', 'to', 'hey');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Renamed/);
  assert.equal(gommand('show', 'hey').status, 0);
  assert.notEqual(gommand('show', 'hi').status, 0);
});

test('edit updates command string', () => {
  gommand('add', 'echo old', 'as', 'cmd');
  const r = gommand('edit', 'cmd', '--cmd', 'echo new');
  assert.equal(r.status, 0);
  assert.match(gommand('show', 'cmd').stdout, /echo new/);
});

test('remove deletes a command', () => {
  gommand('add', 'echo bye', 'as', 'bye');
  const r = gommand('remove', 'bye');
  assert.equal(r.status, 0);
  assert.notEqual(gommand('show', 'bye').status, 0);
});

test('remove --all clears everything', () => {
  gommand('add', 'echo a', 'as', 'a');
  gommand('add', 'echo b', 'as', 'b');
  const r = gommand('remove', '--all');
  assert.equal(r.status, 0);
  assert.match(gommand('list').stdout, /No commands saved/);
});

test('add with -n flag saves with given name', () => {
  const r = gommand('add', 'echo flagged', '-n', 'flagged');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /flagged/);
});

test('unknown run name exits non-zero', () => {
  const r = gommand('ghost-command');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown command/);
});

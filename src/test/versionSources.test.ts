import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  majorFromVersionString,
  extractFromNvmrc,
  extractFromToolVersions,
  extractFromPackageJson,
  extractFromDockerfile,
  extractFromCiWorkflow,
  findDrift,
} from '../versionSources';

test('majorFromVersionString parses a plain version', () => {
  assert.equal(majorFromVersionString('18.6.0'), 18);
});

test('majorFromVersionString strips a leading v', () => {
  assert.equal(majorFromVersionString('v20.1.0'), 20);
});

test('majorFromVersionString strips semver range operators', () => {
  assert.equal(majorFromVersionString('^18.0.0'), 18);
  assert.equal(majorFromVersionString('>=20.0.0'), 20);
  assert.equal(majorFromVersionString('~16.14.0'), 16);
});

test('majorFromVersionString returns null for a named LTS codename', () => {
  assert.equal(majorFromVersionString('lts/hydrogen'), null);
  assert.equal(majorFromVersionString('lts'), null);
});

test('extractFromNvmrc reads the first line', () => {
  const source = extractFromNvmrc('18.6.0\n');
  assert.equal(source?.major, 18);
  assert.equal(source?.name, '.nvmrc');
});

test('extractFromToolVersions finds the nodejs line among other tools', () => {
  const text = 'ruby 3.2.0\nnodejs 20.9.0\npython 3.11.0\n';
  const source = extractFromToolVersions(text);
  assert.equal(source?.major, 20);
});

test('extractFromPackageJson reads engines.node', () => {
  const text = JSON.stringify({ name: 'x', engines: { node: '>=18.0.0' } });
  const source = extractFromPackageJson(text);
  assert.equal(source?.major, 18);
});

test('extractFromPackageJson returns null when there is no engines.node', () => {
  const text = JSON.stringify({ name: 'x' });
  assert.equal(extractFromPackageJson(text), null);
});

test('extractFromDockerfile finds a FROM node: line with a tag suffix', () => {
  const text = 'FROM node:18.6.0-alpine\nRUN npm install\n';
  const sources = extractFromDockerfile(text);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].major, 18);
});

test('extractFromDockerfile handles multiple stages', () => {
  const text = 'FROM node:18 AS build\nFROM node:20-slim AS runtime\n';
  const sources = extractFromDockerfile(text);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].major, 18);
  assert.equal(sources[1].major, 20);
});

test('extractFromCiWorkflow finds node-version in a workflow file', () => {
  const text = ['steps:', "  - uses: actions/setup-node@v4", "    with:", "      node-version: '20.x'"].join('\n');
  const sources = extractFromCiWorkflow('ci.yml', text);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].major, 20);
});

test('findDrift reports no drift when all resolved sources agree', () => {
  const result = findDrift([
    { name: 'a', raw: '18.6.0', major: 18 },
    { name: 'b', raw: '18', major: 18 },
  ]);
  assert.equal(result.hasDrift, false);
});

test('findDrift reports drift when majors disagree', () => {
  const result = findDrift([
    { name: '.nvmrc', raw: '18.6.0', major: 18 },
    { name: 'Dockerfile:1', raw: '20', major: 20 },
  ]);
  assert.equal(result.hasDrift, true);
  assert.deepEqual([...result.majors].sort(), [18, 20]);
});

test('findDrift ignores unresolved sources when checking agreement', () => {
  const result = findDrift([
    { name: '.nvmrc', raw: '18.6.0', major: 18 },
    { name: 'Dockerfile:1', raw: 'lts', major: null },
  ]);
  assert.equal(result.hasDrift, false);
  assert.equal(result.unresolvedSources.length, 1);
});

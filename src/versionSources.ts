/**
 * Pure logic -- no `vscode` dependency. New niche (not a port from
 * the Kotlin catalog). Evidence: GitHub Discussion
 * `renovatebot/renovate#22552` (2023-06-02) -- "Renovate has updated
 * the Node.js versions in my .nvmrc and package.json files, and now
 * they are significantly different" -- real drift between
 * independently-updated version-declaration files.
 *
 * Compares Node.js version declarations across the files a real
 * project typically has: `.nvmrc`, `.node-version`, `.tool-versions`
 * (asdf), `package.json`'s `engines.node`, `Dockerfile`'s
 * `FROM node:X` lines, and CI workflow `node-version:` lines. v0.1
 * scope, honestly noted: compares at the MAJOR version level only --
 * 18.6.0 vs 18.9.2 is not drift, but 18.x vs 20.x is. A named LTS
 * codename (`lts/hydrogen`, `node:lts`) can't be resolved to a
 * number without a lookup table that goes stale -- reported as
 * "unresolved", never guessed.
 */

export interface VersionSource {
  name: string;
  raw: string;
  major: number | null;
}

/** Strips a leading `v`, then any semver range operator
 * (^, ~, >=, <=, >, <, =), then reads the leading major-version
 * digits before the first `.` (or end of string). Returns null for
 * anything that isn't a resolvable numeric version (a named LTS
 * codename, an empty string, a bare "lts"/"current" keyword). */
export function majorFromVersionString(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const stripped = trimmed.replace(/^[v^~]/, '').replace(/^(>=|<=|>|<|=)\s*/, '');
  const match = /^(\d+)/.exec(stripped);
  if (!match) return null;
  return Number(match[1]);
}

export function extractFromNvmrc(text: string): VersionSource | null {
  const firstLine = text.split('\n')[0]?.trim();
  if (!firstLine) return null;
  return { name: '.nvmrc', raw: firstLine, major: majorFromVersionString(firstLine) };
}

export function extractFromNodeVersion(text: string): VersionSource | null {
  const firstLine = text.split('\n')[0]?.trim();
  if (!firstLine) return null;
  return { name: '.node-version', raw: firstLine, major: majorFromVersionString(firstLine) };
}

export function extractFromToolVersions(text: string): VersionSource | null {
  for (const line of text.split('\n')) {
    const match = /^\s*nodejs\s+(\S+)/.exec(line);
    if (match) return { name: '.tool-versions', raw: match[1], major: majorFromVersionString(match[1]) };
  }
  return null;
}

export function extractFromPackageJson(text: string): VersionSource | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const engines = (parsed as Record<string, unknown>).engines;
  if (typeof engines !== 'object' || engines === null) return null;
  const node = (engines as Record<string, unknown>).node;
  if (typeof node !== 'string') return null;
  return { name: 'package.json engines.node', raw: node, major: majorFromVersionString(node) };
}

export function extractFromDockerfile(text: string): VersionSource[] {
  const sources: VersionSource[] = [];
  text.split('\n').forEach((line, index) => {
    const match = /^\s*FROM\s+node:(\S+)/i.exec(line);
    if (match) {
      const versionTag = match[1].split(/[-@]/)[0]; // "18.6.0-alpine" -> "18.6.0"; "18@sha256:..." -> "18"
      sources.push({ name: `Dockerfile:${index + 1}`, raw: match[1], major: majorFromVersionString(versionTag) });
    }
  });
  return sources;
}

export function extractFromCiWorkflow(fileName: string, text: string): VersionSource[] {
  const sources: VersionSource[] = [];
  text.split('\n').forEach((line, index) => {
    const match = /node-version:\s*\[?['"]?([\w.]+)['"]?/.exec(line);
    if (match) {
      sources.push({ name: `${fileName}:${index + 1}`, raw: match[1], major: majorFromVersionString(match[1]) });
    }
  });
  return sources;
}

export interface DriftResult {
  hasDrift: boolean;
  majors: Set<number>;
  resolvedSources: VersionSource[];
  unresolvedSources: VersionSource[];
}

export function findDrift(sources: VersionSource[]): DriftResult {
  const resolvedSources = sources.filter((s) => s.major !== null);
  const unresolvedSources = sources.filter((s) => s.major === null);
  const majors = new Set(resolvedSources.map((s) => s.major as number));
  return { hasDrift: majors.size > 1, majors, resolvedSources, unresolvedSources };
}

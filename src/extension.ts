import * as vscode from 'vscode';
import {
  extractFromNvmrc,
  extractFromNodeVersion,
  extractFromToolVersions,
  extractFromPackageJson,
  extractFromDockerfile,
  extractFromCiWorkflow,
  findDrift,
  VersionSource,
} from './versionSources';

let diagnostics: vscode.DiagnosticCollection;

async function readTextIfExists(uri: vscode.Uri): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return null;
  }
}

interface SourceWithUri extends VersionSource {
  uri: vscode.Uri;
}

async function gatherSources(root: vscode.Uri): Promise<SourceWithUri[]> {
  const results: SourceWithUri[] = [];

  const singleFileExtractors: [string, (text: string) => VersionSource | null][] = [
    ['.nvmrc', extractFromNvmrc],
    ['.node-version', extractFromNodeVersion],
    ['.tool-versions', extractFromToolVersions],
    ['package.json', extractFromPackageJson],
  ];
  for (const [fileName, extractor] of singleFileExtractors) {
    const uri = vscode.Uri.joinPath(root, fileName);
    const text = await readTextIfExists(uri);
    if (text === null) continue;
    const source = extractor(text);
    if (source) results.push({ ...source, uri });
  }

  const dockerfileUri = vscode.Uri.joinPath(root, 'Dockerfile');
  const dockerfileText = await readTextIfExists(dockerfileUri);
  if (dockerfileText !== null) {
    for (const source of extractFromDockerfile(dockerfileText)) {
      results.push({ ...source, uri: dockerfileUri });
    }
  }

  try {
    const workflowsDir = vscode.Uri.joinPath(root, '.github', 'workflows');
    const entries = await vscode.workspace.fs.readDirectory(workflowsDir);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !(name.endsWith('.yml') || name.endsWith('.yaml'))) continue;
      const uri = vscode.Uri.joinPath(workflowsDir, name);
      const text = await readTextIfExists(uri);
      if (text === null) continue;
      for (const source of extractFromCiWorkflow(name, text)) {
        results.push({ ...source, uri });
      }
    }
  } catch {
    // no .github/workflows directory -- fine
  }

  return results;
}

function lineOfSourceName(name: string): number {
  const match = /:(\d+)$/.exec(name);
  return match ? Number(match[1]) - 1 : 0;
}

async function refreshWorkspace(): Promise<void> {
  diagnostics.clear();

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;
  const root = folders[0].uri;

  const sources = await gatherSources(root);
  const result = findDrift(sources);
  if (!result.hasDrift) return;

  const byFile = sources.reduce<Map<string, SourceWithUri[]>>((map, source) => {
    const key = source.uri.toString();
    const list = map.get(key) ?? [];
    list.push(source);
    map.set(key, list);
    return map;
  }, new Map());

  const summary = [...result.resolvedSources].map((s) => `${s.name}=${s.raw}`).join(', ');

  for (const [uriString, sourcesForFile] of byFile) {
    const uri = vscode.Uri.parse(uriString);
    const diags = sourcesForFile
      .filter((source) => source.major !== null)
      .map((source) => {
        const line = lineOfSourceName(source.name);
        const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
        const diagnostic = new vscode.Diagnostic(
          range,
          `Node.js version drift: this declares major ${source.major}, but other sources disagree (${summary}).`,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = 'Node Version Drift Companion';
        return diagnostic;
      });
    diagnostics.set(uri, diags);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('nodeVersionDriftCompanion');
  context.subscriptions.push(diagnostics);

  void refreshWorkspace();

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/{.nvmrc,.node-version,.tool-versions,package.json,Dockerfile,.github/workflows/*.yml,.github/workflows/*.yaml}',
  );
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(() => void refreshWorkspace()),
    watcher.onDidCreate(() => void refreshWorkspace()),
    watcher.onDidDelete(() => void refreshWorkspace()),
  );
}

export function deactivate(): void {
  diagnostics?.dispose();
}

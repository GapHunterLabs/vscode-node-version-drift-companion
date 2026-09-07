# Node Version Drift Companion (VS Code)

Flags when `.nvmrc`/`.node-version`/`.tool-versions`/
`package.json`'s `engines.node`/`Dockerfile`/CI workflows disagree on
the Node.js version. No data leaves your editor.

**v0.1, new niche.** Not a port from the Gap Hunter Labs IntelliJ-
family catalog. Evidence: GitHub Discussion
[`renovatebot/renovate#22552`](https://github.com/renovatebot/renovate/discussions/22552)
(2023-06-02) — *"Renovate has updated the Node.js versions in my
.nvmrc and package.json files, and now they are significantly
different."* Real drift, happening in practice even with dependency
automation already in use — each file gets updated independently
(by different tools, or by hand) and nothing cross-checks them.

## What it does

Reads every version-declaring file present in your workspace root and
compares the **major** version across all of them:

- `.nvmrc`, `.node-version`, `.tool-versions` (asdf `nodejs` line)
- `package.json`'s `engines.node`
- `Dockerfile`'s `FROM node:X` lines (every build stage)
- `.github/workflows/*.yml`'s `node-version:` lines

If two sources resolve to different majors (18 vs 20), every file
that declares a version gets a warning naming all the conflicting
sources. Re-checks automatically whenever any of these files changes.

**v0.1 scope, honestly noted:** compares at the **major** version
level only — `18.6.0` vs `18.9.2` is not drift, but `18.x` vs `20.x`
is. A named LTS codename (`lts/hydrogen`, `node:lts`) can't be
resolved to a number without a lookup table that goes stale — reported
as unresolved, never guessed at.

## Privacy

See [PRIVACY.md](PRIVACY.md) — zero network calls, everything runs
against files already in your workspace.

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test
```

To build an installable package without publishing:

```bash
npx @vscode/vsce package
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).

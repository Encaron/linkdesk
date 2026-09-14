# create-linkdesk-plugin

The LinkDesk plugin scaffold — one command generates your first plugin project (the `yo code` equivalent).

```bash
npm create linkdesk-plugin my-cool-plugin
```

Run it without a name and it asks interactively:

```bash
npm create linkdesk-plugin
```

## What you get

The generated project has **the same shape as an official plugin** — README / CHANGELOG / resources / i18n, nothing missing:

```
my-cool-plugin/
├── plugin.json           # plugin manifest (JSONC: comments + trailing commas allowed, sectioned example fields, VS Code $schema validation)
├── package.json          # scripts: dev / dev:real / build / publish / validate / lint / verify / test
├── tsconfig.json         # jsx: react-jsx + window.linkdesk.* types (@linkdesk/plugin-sdk)
├── AGENTS.md             # what this project is + the iron rules + where the docs are (for your AI assistant)
├── .gitignore            # node_modules / dist / *.linkdesk-plugin
├── README.md             # description — data source for the marketplace "Details" tab + the directory contract table
├── CHANGELOG.md          # release notes — data source for the marketplace "Changelog" tab
├── .github/workflows/ci.yml   # CI that runs `npm run verify` on every push
├── scripts/ci-verify.mjs      # the strict tier CI runs (lint + tests + declaration self-checks)
├── .vscode/settings.json      # plugin.json is treated as jsonc (comments do not light up red)
├── resources/
│   └── icon.svg          # placeholder icon — replace it with your own
├── src/
│   ├── index.tsx         # view component, default export — the shell renders it with { isActive, tabId?, sourceId? }
│   └── index.css         # styling example — colors/font sizes via var(--xxx), spacing on a 4px grid
└── i18n/
    └── en.json           # English translations (key = the source string)
```

> **No empty folders are pre-created** (git does not track them anyway) — "where does this go" is spelled out in the generated `README.md`'s directory contract table. Prose is clearer than a folder-shaped hint.

## Commands

```bash
cd my-cool-plugin
npm install

npm run dev        # browser preview with hot reload (changes apply instantly)
npm run dev:real   # real-device loop — writes into {userData}/plugins/<id> + CDP reload (for plugins needing real IPC / serial / LSP)
npm run validate   # validate plugin.json / theme recipes
npm run lint       # SDK rule tier (hard-coded colors / font sizes / spacing grid / eslint rules)
npm run test       # unit tests (vitest)
npm run verify     # full pre-delivery tier — what CI runs
npm run build      # produce <pluginId>.linkdesk-plugin — installable in LinkDesk / publishable
npm run publish    # one-shot publish (creates the GitHub Release + uploads + updates the catalog)
```

> The full author documentation (dev preview / build / the whole publishing chain) lives in the LinkDesk repo:
> the **English tree** at <https://github.com/Encaron/linkdesk/tree/electron/docs/03-plugin-authoring> (start at `00-readme.md`),
> with the Chinese original at `docs/03-插件制造/`.

> 🔴 The generated `AGENTS.md` also carries this pointer, plus the iron rules inline — so the AI working in your project knows where to look without being told.

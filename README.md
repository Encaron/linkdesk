# LinkDesk

> **A universal container. Everything is a plugin.**
>
> LinkDesk = *Link* + *Desk*. The core knows nothing about what the software is for —
> it only provides the tables (registries, command bus, data pipelines) and the phone book.
> Every feature is a plugin in a surrounding room.

## Download

**[Download for Windows](https://github.com/encaron/linkdesk/releases/latest)** — Windows 10/11 · 64-bit

> Version number and installer filename are on the Release page.
> The single source of truth for the installer filename is the `artifactName` in
> [`electron-builder.yml`](electron-builder.yml) — see
> [02-发布流水线.md §〇](docs/02-Electron架构/E6_插件生态与发布/05-文档与发布/02-发布流水线.md)
> for why that matters.

## Status

🚧 **In development.** Under `0.x` — no release is a stable release yet.
The current phase and its progress live in
[E6-执行清单.md](docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md) (Chinese),
which is the single source of truth for what is done and what is not.

## Build from source

Requires **Node.js ≥ 24**.

```bash
npm ci
npm run electron:dev     # run the desktop app in dev mode
npm run check            # type-check + lint + full test suite + all gates
npm run electron:build   # produce the Windows installer
```

Build artifacts land **outside the repo**, in `../linkdesk-build/`.

## Documentation

The `docs/` tree is written in Chinese; it is the project's working memory.

| Where | What |
|---|---|
| [`docs/`](docs/) | Everything, indexed by phase |
| [`docs/02-Electron架构/`](docs/02-Electron架构/) | Electron shell architecture |
| [`docs/03-插件制造/`](docs/03-插件制造/) | Writing plugins — API contract, lifecycle, `plugin.json` |
| [`docs/06-发布管理/发布清单.md`](docs/06-发布管理/发布清单.md) | Release checklist |
| [`CLAUDE.md`](CLAUDE.md) | Architecture, hard constraints, dev commands |

## License

Not yet chosen — see the repository owner.

# Curated Journal

[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2056-000020?logo=expo&logoColor=white)](https://docs.expo.dev/versions/v56.0.0/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

**[GitHub](https://github.com/equationalapplications/curated-journal)** · **[Technical Spec](./docs/superpowers/specs/2026-06-24-curated-journal-demo-app.md)** · **[Issues](https://github.com/equationalapplications/curated-journal/issues)** · **[expo-llm-wiki](https://github.com/equationalapplications/expo-llm-wiki)** · **[ScopeLab](https://equationalapplications.github.io/expo-llm-wiki/scopelab/)** · **[WikiDemo](https://equationalapplications.github.io/expo-llm-wiki/wiki-demo/)**

A privacy-first, **100% offline** mobile second brain built with [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/). Curated Journal is the flagship reference app for the [`@equationalapplications/expo-llm-wiki`](https://github.com/equationalapplications/expo-llm-wiki) ecosystem — a practical personal journal and a developer cookbook for on-device LLM memory on iOS and Android.

> Inspired by [Andrej Karpathy's LLM Wiki memory spec](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Supports [Open Knowledge Format (OKF) v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) import and export for portable, interoperable knowledge bases.

---

## Why Curated Journal?

Mobile LLM apps often assume a cloud backend, background jobs, and unlimited RAM. Real devices impose hard limits — iOS Jetsam, battery drain, and strict background execution caps.

Curated Journal shows how to build a **Google NotebookLM-style experience entirely on-device**:

- **Zero backend** — all memory lives in local SQLite via `@equationalapplications/expo-llm-wiki`
- **Bring Your Own Inference (BYOI)** — run quantized GGUF models with [`llama.rn`](https://github.com/mybigday/llama.rn)
- **Mobile-safe maintenance** — heavy librarian/heal passes run in foreground **Night Shift** mode while plugged in, not silently in the background
- **Portable knowledge** — import and export OKF v0.1 zip bundles
- **Self-organizing graph** — emergent ontology mode visualized at 60fps with Skia + D3 force layout

---

## Key Principles

- **Offline first:** No network required after you sideload a GGUF model. v1 uses MiniSearch keyword retrieval — no second embedding model loaded alongside inference.
- **BYOI:** Provide one `LLMProvider.generateText` implementation (`llama.rn`). The wiki engine owns prompt construction, JSON parsing, and SQLite writes.
- **Foreground maintenance:** Auto-librarian and auto-heal are disabled; **Night Shift** runs heavy passes only while charging, with keep-awake enabled.
- **Namespace safe:** Journal memory uses the wiki engine's prefixed tables (`llm_wiki_` by default) — no collisions with app-owned SQLite (e.g. `chat_messages`).
- **Emergent ontology:** Default mode lets the LLM invent `node_types` and `edge_types` during librarian passes; the graph explorer visualizes what the engine discovers.
- **Privacy by design:** All data stays in the app sandbox. No analytics SDK, no cloud sync in v1.

---

## Features

### NotebookLM-style journal + synthesis

Split-pane layout on tablet and landscape: markdown journal entries on the left, chat synthesis on the right. Assistant replies include tappable `[cite:fact_id]` chips that scroll directly to the source note.

### Night Shift

When your journal is ready for deep processing, plug in your device and start **Night Shift** — an ambient, full-screen maintenance session that runs `runLibrarian` and `runHeal` safely in the foreground with keep-awake and charging gates.

### OKF import & export

- **Import:** pick a `.zip` → fast JSI extraction via `react-native-nitro-unzip` → chunked SQLite ingestion
- **Export:** dump wiki memory to OKF markdown → zip with `react-native-zip-archive` → share via the system sheet

### Emergent graph explorer

Default ontology mode is **emergent** — the LLM invents `node_types` and `edge_types` as it organizes your notes. Explore the resulting knowledge graph in an interactive Skia canvas.

---

## Architecture at a glance

```text
expo-router UI
    ├── Journal + Synthesis (split pane)
    ├── Graph Explorer (Skia + d3-force)
    ├── Night Shift (maintenance queue)
    └── OKF import / export

@equationalapplications/expo-llm-wiki  (SQLite memory engine)
    └── llama.rn  (BYOI — LLMProvider.generateText)

v1 retrieval: MiniSearch keyword search (no second embedding model)
```

---

## Tech stack

| Layer | Packages |
|-------|----------|
| **Framework** | Expo SDK 56, React Native 0.85, expo-router |
| **Memory engine** | `@equationalapplications/expo-llm-wiki`, `expo-sqlite` |
| **Inference** | `llama.rn` (BYOI GGUF) |
| **Knowledge interchange** | `@equationalapplications/core-okf` |
| **Graph UI** | `@shopify/react-native-skia`, `d3-force` |
| **Zip I/O** | `react-native-nitro-unzip` (import), `react-native-zip-archive` (export) |
| **Orchestration** | XState (`journalWikiMachine`) |

Native modules require a **development build** — Expo Go is not supported.

---

## Getting started

### Prerequisites

- Node.js 20+
- Xcode (iOS) or Android Studio (Android)
- [Expo development build](https://docs.expo.dev/develop/development-builds/introduction/) (required for native modules)
- A GGUF model file for on-device inference (not bundled with the app)

### Install

```bash
git clone https://github.com/equationalapplications/curated-journal.git
cd curated-journal
npm install
npx expo prebuild
```

### Test

```bash
npm test
```

Dependencies include `@equationalapplications/expo-llm-wiki`, `llama.rn`, Skia, and OKF zip tooling. Use `npx expo install` for Expo-managed packages so the version resolver picks builds compatible with SDK 56.

### Run (development build)

Native modules require a local compile — there is no Expo Go path. First run generates the native `ios/`/`android/` projects (`expo prebuild`) then builds and installs on a simulator/emulator/device.

```bash
# iOS Simulator — requires Xcode + Command Line Tools (macOS only)
npx expo run:ios
npx expo run:ios --device "iPhone 17 Pro Max"   # target a specific simulator

# Android Emulator/device — requires Android Studio (any OS)
npx expo run:android
```

No Xcode? Build iOS in the cloud instead: `eas build --platform ios --profile development`.

Rebuild only when native code/config changes. For day-to-day JS/TS development after the first build:

```bash
npx expo start --dev-client
```

### Configure your model

In Settings, pick a local `.gguf` via the document picker. Until a model is loaded, the app uses a deterministic mock LLM for chat and maintenance demos. **Night Shift** requires a loaded model and a charging power state.

---

## Helpful links

| Resource | Description |
|----------|-------------|
| [expo-llm-wiki README](https://github.com/equationalapplications/expo-llm-wiki) | Memory engine API, hooks, and configuration |
| [expo-llm-wiki — OKF import/export](https://github.com/equationalapplications/expo-llm-wiki/blob/main/packages/core/README.md#okf-importexport) | `parseOkfBundle` / `formatOkfBundle` adapters |
| [expo-llm-wiki — Emergent ontology](https://github.com/equationalapplications/expo-llm-wiki/blob/main/docs/superpowers/specs/2026-06-23-per-entity-seeded-ontology-design.md) | Strict, Emergent, and Off ontology modes |
| [expo-llm-wiki — Graph traversal](https://github.com/equationalapplications/expo-llm-wiki/blob/main/docs/superpowers/specs/2026-06-23-graph-traversal-api-design.md) | `traverseGraph` and `formatGraphContext` |
| [OKF v0.1 spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) | Open Knowledge Format bundle layout |
| [Expo SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/) | Platform APIs used by this app |
| [llama.rn](https://github.com/mybigday/llama.rn) | On-device GGUF inference for React Native |

---

## Ecosystem

Curated Journal is part of the Equational Applications LLM Wiki family:

| Package | Role |
|---------|------|
| [`expo-llm-wiki`](https://github.com/equationalapplications/expo-llm-wiki) | Expo/React Native memory engine + hooks |
| [`core-llm-wiki`](https://github.com/equationalapplications/expo-llm-wiki/tree/main/packages/core) | Core SQLite memory, OKF adapters, graph traversal |
| [`core-okf`](https://github.com/equationalapplications/expo-llm-wiki/tree/main/packages/okf) | OKF v0.1 parse/serialize primitives |
| [`core-llm-tools`](https://github.com/equationalapplications/expo-llm-wiki/tree/main/packages/core-llm-tools) | Agent tool schemas (reference for future chat tooling) |
| [ScopeLab](https://equationalapplications.github.io/expo-llm-wiki/scopelab/) | Interactive retrieval tuning demo (web) |
| [WikiDemo](https://equationalapplications.github.io/expo-llm-wiki/wiki-demo/) | Full memory lifecycle demo (web) |

**Related apps:** Curated Journal is the mobile counterpart to the web demos above — same memory engine, adapted for Jetsam limits, battery, and BYOI on device.

---

## Project structure

```text
src/
  app/              # expo-router screens (tabs, night-shift, import, …)
  components/       # journal, synthesis, graph, night-shift UI
  contexts/         # Journal, citation navigation, LLM provider
  hooks/            # split pane, Night Shift gates, journalWiki actor
  machines/         # journalWikiMachine (Night Shift queue, import/export)
  lib/              # llama provider, OKF pipeline, citation parser, graph
  services/         # wiki bootstrap, chat_messages SQLite
docs/
  superpowers/specs/  # Design & technical specifications
  superpowers/plans/  # Implementation plans
```

---

## Contributing

This repository is intended as an open-source reference implementation. Before opening a PR:

1. Read the [technical specifications](./docs/superpowers/specs/)
2. Follow existing code conventions in `src/`
3. Consult [Expo SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/) for platform APIs

Issues and PRs welcome at [github.com/equationalapplications/curated-journal](https://github.com/equationalapplications/curated-journal).

---

## License

MIT — see [LICENSE](./LICENSE).

---

Made with ❤️ by [Equational Applications LLC](https://equationalapplications.com/).

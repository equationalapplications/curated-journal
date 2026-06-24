# Curated Journal

A privacy-first, **100% offline** mobile second brain built with [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/). Curated Journal is the flagship reference app for the [`@equationalapplications/expo-llm-wiki`](https://github.com/equationalapplications/expo-llm-wiki) ecosystem — a practical personal journal and a developer cookbook for on-device LLM memory on iOS and Android.

> **Status:** Early scaffold. Feature implementation follows the [technical specification](./docs/superpowers/specs/2026-06-24-curated-journal-demo-app.md).

---

## Why Curated Journal?

Mobile LLM apps often assume a cloud backend, background jobs, and unlimited RAM. Real devices impose hard limits — iOS Jetsam, battery drain, and strict background execution caps.

Curated Journal shows how to build a **Google NotebookLM-style experience entirely on-device**:

- **Zero backend** — all memory lives in local SQLite via `@equationalapplications/expo-llm-wiki`
- **Bring Your Own Inference (BYOI)** — run quantized GGUF models with [`llama.rn`](https://github.com/mybigday/llama.rn)
- **Mobile-safe maintenance** — heavy librarian/heal passes run in foreground **Night Shift** mode while plugged in, not silently in the background
- **Portable knowledge** — import and export [Open Knowledge Format (OKF) v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) zip bundles
- **Self-organizing graph** — emergent ontology mode visualized at 60fps with Skia + D3 force layout

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

For the full design — memory constraints, citation protocol, chunked import, graph node caps, and package list — see the **[Technical Specification](./docs/superpowers/specs/2026-06-24-curated-journal-demo-app.md)**.

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
- A GGUF model file for on-device inference (not bundled with the app)

### Install

```bash
git clone https://github.com/equationalapplications/curated-journal.git
cd curated-journal
npm install
```

### Run (development build)

```bash
# Create native projects and run locally
npx expo run:ios
# or
npx expo run:android
```

For day-to-day JS development after the native build is installed:

```bash
npx expo start --dev-client
```

### Configure your model

In Settings, point the app at a local `.gguf` file via the document picker. Until a model is loaded, the app operates in keyword-only retrieval mode (MiniSearch) — useful for exploring the journal UI without inference.

---

## Ecosystem

Curated Journal is part of the Equational Applications LLM Wiki family:

| Package | Role |
|---------|------|
| [`expo-llm-wiki`](https://github.com/equationalapplications/expo-llm-wiki) | Expo/React Native memory engine + hooks |
| [`core-llm-wiki`](https://github.com/equationalapplications/expo-llm-wiki/tree/main/packages/core) | Core SQLite memory, OKF adapters, graph traversal |
| [`core-okf`](https://github.com/equationalapplications/expo-llm-wiki/tree/main/packages/okf) | OKF v0.1 parse/serialize primitives |
| [ScopeLab](https://equationalapplications.github.io/expo-llm-wiki/scopelab/) | Interactive retrieval tuning demo (web) |
| [WikiDemo](https://equationalapplications.github.io/expo-llm-wiki/wiki-demo/) | Full memory lifecycle demo (web) |

---

## Project structure

```text
src/
  app/              # expo-router screens (tabs, night-shift, import, …)
  components/       # UI primitives
  machines/         # journalWikiMachine (planned)
  lib/              # llama provider, OKF pipeline, citation parser (planned)
docs/
  superpowers/specs/  # Design & technical specifications
```

---

## Contributing

This repository is intended as an open-source reference implementation. Before opening a PR:

1. Read the [technical specification](./docs/superpowers/specs/2026-06-24-curated-journal-demo-app.md)
2. Follow existing code conventions in `src/`
3. Consult [Expo SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/) for platform APIs

Issues and PRs welcome at [github.com/equationalapplications/curated-journal](https://github.com/equationalapplications/curated-journal).

---

## License

MIT — see [LICENSE](./LICENSE).

export type CuratedModelId = 'fast-light' | 'deep-thinker';

export type LlamaModelConfig = {
  contextSize: number;
  nGpuLayers?: number;
  useMlock?: boolean;
};

export type DeviceHint = 'all' | 'recommended-high-ram';

export type CuratedModel = {
  id: CuratedModelId;
  displayName: string;
  tagline: string;
  sizeLabel: string;
  sizeBytes: number;
  hfUrl: string;
  filename: string;
  llamaConfig: LlamaModelConfig;
  deviceHint: DeviceHint;
  deviceWarning?: string;
};

// sizeBytes pinned against the live HF `resolve/main` Content-Length at the
// commit SHA noted below. If a download fails byte verification for every
// user, the upstream owner likely rewrote `main` — re-HEAD the hfUrl, update
// sizeBytes + the SHA comment, and ship a normal app update (see spec §4.8).
export const MODEL_CATALOG: CuratedModel[] = [
  {
    id: 'fast-light',
    displayName: 'Fast & Light',
    tagline: 'Best for everyday journaling. Fast responses, gentle on battery.',
    sizeLabel: '~2.3 GB',
    // HF commit a64113399c2f6b8ad3e11c394733a2ddadaa7f33
    sizeBytes: 2393231072,
    hfUrl:
      'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    filename: 'phi-3-mini-4k-instruct-q4.gguf',
    llamaConfig: { contextSize: 4096, useMlock: true },
    deviceHint: 'all',
  },
  {
    id: 'deep-thinker',
    displayName: 'Deep Thinker',
    tagline: 'Richer synthesis and emergent ontology. Works on most modern phones and tablets.',
    sizeLabel: '~2.0 GB',
    // HF commit 7dabda4d13d513e3e842b20f0d435c732f172cbe
    sizeBytes: 2104932768,
    hfUrl:
      'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    llamaConfig: { contextSize: 4096, useMlock: false },
    deviceHint: 'all',
  },
];

export function getCuratedModel(id: CuratedModelId): CuratedModel {
  const model = MODEL_CATALOG.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown curated model id: ${id}`);
  return model;
}

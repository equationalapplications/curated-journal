// 'deep-thinker' is reserved for a future reasoning-enabled tier (e.g. Qwen3.5-9B);
// see the model-hub spec §4.4.
export type CuratedModelId = 'fast-light' | 'smarter-slower';

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
    tagline: 'Quick, dependable answers for everyday journaling. Sized for phones like the Pixel 6.',
    sizeLabel: '~2.4 GB',
    // HF commit a06e946bb6b655725eafa393f4a9745d460374c9
    // Q4_0 rather than Q4_K_M: llama.cpp repacks Q4_0 for faster ARM CPU inference,
    // and Android runs CPU-only here (nGpuLayers defaults to 0).
    sizeBytes: 2375773280,
    hfUrl:
      'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf',
    filename: 'qwen3-4b-instruct-2507-q4_0.gguf',
    llamaConfig: { contextSize: 8192, useMlock: true },
    deviceHint: 'all',
  },
  {
    id: 'smarter-slower',
    displayName: 'Smarter & Slower',
    tagline: 'Richer synthesis and emergent ontology. Best on newer iPhones and flagship phones.',
    sizeLabel: '~2.7 GB',
    // HF commit e87f176479d0855a907a41277aca2f8ee7a09523
    // Runs with thinking disabled (see llamaProvider); a reasoning tier would be 'deep-thinker'.
    sizeBytes: 2740937888,
    hfUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    filename: 'qwen3.5-4b-q4_k_m.gguf',
    llamaConfig: { contextSize: 8192, useMlock: false },
    deviceHint: 'recommended-high-ram',
    deviceWarning:
      'This model works best on newer phones and tablets with 8 GB or more RAM. It may be slow or unstable on older devices.',
  },
];

export function getCuratedModel(id: CuratedModelId): CuratedModel {
  const model = MODEL_CATALOG.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown curated model id: ${id}`);
  return model;
}

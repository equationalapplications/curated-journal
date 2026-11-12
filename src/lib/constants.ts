export const SPLIT_PANE_MIN_WIDTH = 768;
export const CHAT_TRAVERSAL_NODE_CAP = 12;
export const CHAT_TRAVERSAL_MAX_DEPTH = 1;
export const GRAPH_NODE_CAP = 200;
export const JOURNAL_LIST_MAX_RESULTS = 500;
export const IMPORT_CHUNK_SIZE = 25;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
export const CHAT_OUTPUT_TOKEN_RESERVE = 512;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

// llm-wiki 8.0.0 changed the engine defaults to the ops librarian and
// deferred maintenance. Pin the 7.x engine explicitly: Night Shift runs the
// librarian/heal itself, and the curated on-device models are validated
// against the legacy librarian only. Adopting 'ops' is a separate,
// on-device-evaluated change. Infinity thresholds keep write() from
// auto-running maintenance.
export const WIKI_CONFIG = {
  autoLibrarianThreshold: Infinity,
  autoHealThreshold: Infinity,
  librarian: { strategy: 'legacy' },
  maintenance: 'auto',
} as const;

export const ENTITY_ID_KEY = 'curated_journal_entity_id';
export const MODEL_PATH_KEY = 'curated_journal_model_path';
export const MODEL_ID_KEY = 'curated_journal_model_id';
export const DISPLAY_NAME_KEY = 'curated_journal_display_name';
export const NIGHT_SHIFT_PRUNE_KEY = 'curated_journal_night_shift_prune';

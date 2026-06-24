export const SPLIT_PANE_MIN_WIDTH = 768;
export const CHAT_TRAVERSAL_NODE_CAP = 12;
export const CHAT_TRAVERSAL_MAX_DEPTH = 1;
export const GRAPH_NODE_CAP = 200;
export const IMPORT_CHUNK_SIZE = 25;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
export const CHAT_OUTPUT_TOKEN_RESERVE = 512;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export const WIKI_CONFIG = {
  autoLibrarianThreshold: Infinity,
  autoHealThreshold: Infinity,
} as const;

export const ENTITY_ID_KEY = 'curated_journal_entity_id';
export const MODEL_PATH_KEY = 'curated_journal_model_path';

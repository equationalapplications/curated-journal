import {
  CHAT_TRAVERSAL_NODE_CAP,
  GRAPH_NODE_CAP,
  SPLIT_PANE_MIN_WIDTH,
  WIKI_CONFIG,
} from '@/lib/constants';

describe('constants', () => {
  it('disables auto maintenance', () => {
    expect(WIKI_CONFIG.autoLibrarianThreshold).toBe(Infinity);
    expect(WIKI_CONFIG.autoHealThreshold).toBe(Infinity);
  });

  it('pins the 7.x engine (legacy librarian, auto maintenance) across llm-wiki 8.x', () => {
    // llm-wiki 8.0.0 flipped the defaults to the ops librarian + deferred
    // maintenance. Night Shift drives librarian/heal explicitly and the
    // on-device models are only validated against the legacy librarian, so
    // both are set explicitly; Infinity thresholds keep write() from
    // auto-running either way.
    expect(WIKI_CONFIG.librarian).toEqual({ strategy: 'legacy' });
    expect(WIKI_CONFIG.maintenance).toBe('auto');
  });

  it('enforces chat traversal cap per spec', () => {
    expect(CHAT_TRAVERSAL_NODE_CAP).toBe(12);
  });

  it('enforces graph node cap', () => {
    expect(GRAPH_NODE_CAP).toBe(200);
  });

  it('split pane breakpoint', () => {
    expect(SPLIT_PANE_MIN_WIDTH).toBe(768);
  });
});

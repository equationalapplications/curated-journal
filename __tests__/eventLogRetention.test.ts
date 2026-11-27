// INTENT: the event log is never pruned. See eslint.config.js (forget/erase
// bans) and src/hooks/useJournalWiki.tsx.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { parseOkfBundle } from '@equationalapplications/core-llm-wiki';

const mockRunPrune = jest.fn();
const mockCapture: { input?: any } = {};
jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  useWikiMaintenance: () => ({ runLibrarian: jest.fn(), runHeal: jest.fn(), runPrune: mockRunPrune }),
}));
jest.mock('xstate', () => ({
  createActor: (_m: unknown, opts: { input: unknown }) => {
    mockCapture.input = opts.input;
    mockCapture.input = opts.input;
    return { start: () => ({ stop: jest.fn(), send: jest.fn() }) };
  },
}));
jest.mock('@xstate/react', () => ({ useSelector: () => null }));
jest.mock('@/machines/journalWikiMachine', () => ({ journalWikiMachine: {} }));

import { JournalWikiProvider } from '@/hooks/useJournalWiki';

describe('event-log retention', () => {
  it('prune keeps live events (retainEventsFor: null)', async () => {
    render(createElement(JournalWikiProvider, { wiki: {} as never, entityId: 'e', children: null }));
    await waitFor(() => expect(mockCapture.input).toBeDefined());
    await mockCapture.input.maintenance.runPrune('e');
    expect(mockRunPrune).toHaveBeenCalledWith('e', { retainEventsFor: null });
  });

  it('parseOkfBundle never yields forgotten_at on events', () => {
    const dir = join(__dirname, '..', 'fixtures', 'night-shift-seed', 'entities/journal/facts');
    const files = readdirSync(dir).map((n) => ({
      path: `entities/journal/facts/${n}`,
      content: readFileSync(join(dir, n), 'utf8'),
    }));
    const dump = parseOkfBundle('seed', files, { defaultSchema: 'fact' });
    const events = Object.values(dump.entities).flatMap((e: any) => e.events ?? []);
    for (const ev of events) expect(ev).not.toHaveProperty('forgotten_at');
    expect(JSON.stringify(dump)).not.toContain('forgotten_at');
  });
});

import { createActor, waitFor } from 'xstate';
import { WikiBusyError } from '@equationalapplications/expo-llm-wiki';
import { journalWikiMachine } from '@/machines/journalWikiMachine';

const makeWiki = () => ({
  importDump: jest.fn(async () => undefined),
  exportDump: jest.fn(async () => ({ version: 1, entities: {} })),
});

const maintenance = {
  runLibrarian: jest.fn(async () => undefined),
  runHeal: jest.fn(async () => undefined),
  runReembed: jest.fn(async () => undefined),
  runPrune: jest.fn(async () => undefined),
};

describe('journalWikiMachine', () => {
  it('runs night shift queue sequentially', async () => {
    const order: string[] = [];
    maintenance.runLibrarian.mockImplementation(async () => {
      order.push('librarian');
    });
    maintenance.runHeal.mockImplementation(async () => {
      order.push('heal');
    });
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [
        { operation: 'librarian', entityId: 'e1' },
        { operation: 'heal', entityId: 'e1' },
      ],
    });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(order).toEqual(['librarian', 'heal']);
    actor.stop();
  });

  it('aborts night shift after current step', async () => {
    let healStarted = false;
    maintenance.runLibrarian.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );
    maintenance.runHeal.mockImplementation(async () => {
      healStarted = true;
    });
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [
        { operation: 'librarian', entityId: 'e1' },
        { operation: 'heal', entityId: 'e1' },
      ],
    });
    actor.send({ type: 'ABORT_NIGHT_SHIFT' });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(healStarted).toBe(false);
    actor.stop();
  });

  it('queues import while night shift is active', async () => {
    maintenance.runLibrarian.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const wiki = makeWiki();
    const actor = createActor(journalWikiMachine, {
      input: { wiki: wiki as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [{ operation: 'librarian', entityId: 'e1' }],
    });
    actor.send({ type: 'IMPORT', dump: { version: 1, entities: {} }, merge: true });
    expect(actor.getSnapshot().matches('busyRetry')).toBe(true);
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    actor.stop();
  });

  it('retries import on WikiBusyError', async () => {
    const wiki = makeWiki();
    wiki.importDump
      .mockRejectedValueOnce(new WikiBusyError('import', 'e1'))
      .mockResolvedValueOnce(undefined);
    const actor = createActor(journalWikiMachine, {
      input: { wiki: wiki as never, maintenance },
    }).start();
    actor.send({ type: 'IMPORT', dump: { version: 1, entities: {} }, merge: true });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 3000 });
    expect(wiki.importDump).toHaveBeenCalledTimes(2);
    actor.stop();
  });
});

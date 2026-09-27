import { createActor } from 'xstate';
import { graphLoadMachine } from '@/machines/graphLoadMachine';

const makeDump = { entities: [], facts: [], edges: [] } as never;

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('graphLoadMachine', () => {
  it('loads: idle → loading → ready with the built graph', async () => {
    const actor = createActor(graphLoadMachine, {
      input: { load: jest.fn(async () => makeDump) },
    }).start();

    actor.send({ type: 'LOAD' });
    expect(actor.getSnapshot().value).toBe('loading');

    await flush();
    expect(actor.getSnapshot().value).toBe('ready');
    expect(actor.getSnapshot().context.graph).toBe(makeDump);
  });

  it('fails into failed with the error and RETRY re-enters loading', async () => {
    const load = jest.fn(async () => {
      throw new Error('prepareAsync NPE');
    });
    const actor = createActor(graphLoadMachine, { input: { load } }).start();

    actor.send({ type: 'LOAD' });
    await flush();
    expect(actor.getSnapshot().value).toBe('failed');
    expect(actor.getSnapshot().context.error?.message).toBe('prepareAsync NPE');

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('loading');
  });

  it('does not reload on duplicate LOAD while loading', () => {
    const load = jest.fn(async () => makeDump);
    const actor = createActor(graphLoadMachine, { input: { load } }).start();

    actor.send({ type: 'LOAD' });
    actor.send({ type: 'LOAD' });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

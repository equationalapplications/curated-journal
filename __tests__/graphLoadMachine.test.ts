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

  it('restarts the load when LOAD arrives while loading', async () => {
    const first = { entities: [], facts: [], edges: [] } as never;
    const second = { entities: [], facts: [], edges: [], fresh: true } as never;
    const load = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const actor = createActor(graphLoadMachine, { input: { load } }).start();

    actor.send({ type: 'LOAD' });
    actor.send({ type: 'LOAD' }); // refresh requested mid-load wins
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(actor.getSnapshot().value).toBe('ready');
    expect(actor.getSnapshot().context.graph).toBe(second);
  });
});

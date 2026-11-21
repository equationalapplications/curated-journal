/** T-H7: the at-rest invariant, checked over every state node with `xstate/graph`. */
import { toDirectedGraph } from 'xstate/graph';
import { modelHubMachine } from '@/machines/modelHubMachine';

type Edge = { source: string; event: string; target: string };

function edges(): Edge[] {
  const out: Edge[] = [];
  const walk = (n: any) => {
    for (const e of n.edges ?? []) {
      out.push({
        source: e.source.id.replace('modelHub.', ''),
        event: e.label.text.replace(/^xstate\.(done|error)\.actor\.0\.modelHub\.\w+$/, (_m: string, kind: string) => `invoke.${kind}`),
        target: e.target.id.replace('modelHub.', ''),
      });
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(toDirectedGraph(modelHubMachine));
  return out.filter((e) => e.event !== 'SET_DISPLAY_NAME');
}

const uniq = (xs: string[]) => [...new Set(xs)].sort();

describe('T-H7 the hub machine graph', () => {
  const root = (modelHubMachine as any).root;

  it('only downloading invokes runDownload; the only root invoke is controllerEvents; pausing invokes pause only', () => {
    const invokes = (name: string) => ([] as any[]).concat(root.states[name].config.invoke ?? []).map((i: any) => i.src);
    for (const name of Object.keys(root.states)) {
      if (name === 'downloading') expect(invokes(name)).toEqual(['runDownload']);
      else expect(invokes(name)).not.toContain('runDownload');
      expect(invokes(name)).not.toContain('controllerEvents');
    }
    expect(invokes('pausing')).toEqual(['pauseTask']);
    expect(([] as any[]).concat(root.config.invoke ?? []).map((i: any) => i.src)).toEqual(['controllerEvents']);
  });

  it('edges into downloading are a closed list', () => {
    const into = edges().filter((e) => e.target === 'downloading');
    expect(uniq(into.map((e) => `${e.source}:${e.event}`))).toEqual([
      'cellularConfirm:CELLULAR_CONFIRM',
      'confirmingNetwork:invoke.done',
      'downloading:DOWNLOAD_PROGRESS',
      'selecting:RESTORE_DOWNLOAD',
    ]);
  });

  it('edges out of downloading are a closed list', () => {
    const out = edges().filter((e) => e.source === 'downloading');
    expect(uniq(out.map((e) => `${e.event}>${e.target}`))).toEqual([
      'APP_BACKGROUND>pausing',
      'DOWNLOAD_COMPLETE>verifying',
      'DOWNLOAD_PROGRESS>downloading',
      'FAIL>failed',
      'NOT_LIVE>confirmingNetwork',
      'PAUSE>pausing',
      'REFUSED>pausing',
      'TRANSFER_STOPPED>paused',
    ]);
  });

  it('pausing has only its settle edges and self-updates', () => {
    const out = edges().filter((e) => e.source === 'pausing');
    expect(uniq(out.map((e) => `${e.event}>${e.target}`))).toEqual([
      'APP_BACKGROUND>pausing',
      'APP_FOREGROUND>pausing',
      'TRANSFER_STOPPED>pausing',
      'invoke.done>confirmingNetwork',
      'invoke.done>failed',
      'invoke.done>paused',
      'invoke.done>verifying',
      'invoke.error>failed',
    ]);
  });

  it('TRANSFER_STOPPED is handled in exactly the listed states', () => {
    const handled = uniq(edges().filter((e) => e.event === 'TRANSFER_STOPPED').map((e) => e.source));
    expect(handled).toEqual(['awaitingWifi', 'cellularConfirm', 'confirmingNetwork', 'downloading', 'paused', 'pausing']);
  });

  it('paused is never entered by PAUSE or APP_BACKGROUND (a pause settles first)', () => {
    expect(edges().some((e) => e.event === 'PAUSE' && e.target === 'paused')).toBe(false);
    expect(edges().some((e) => e.target === 'paused' && e.event === 'APP_BACKGROUND')).toBe(false);
  });
});

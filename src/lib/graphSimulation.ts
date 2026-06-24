import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force';

export type SimNode = { id: string; x?: number; y?: number };
export type SimLink = { source: string; target: string };

export function runGraphSimulation(nodes: SimNode[], links: SimLink[], size: number) {
  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links)
        .id((d) => (d as SimNode).id)
        .distance(40),
    )
    .force('charge', forceManyBody().strength(-120))
    .force('center', forceCenter(size / 2, size / 2))
    .force('collide', forceCollide(18));
  sim.tick(300);
  sim.stop();
  return nodes;
}

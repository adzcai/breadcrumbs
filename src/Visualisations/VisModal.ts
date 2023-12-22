import * as d3 from 'd3';
import type Graph from 'graphology';
import { Modal, Notice } from 'obsidian';
import VisComp from '../Components/VisComp.svelte';
import type { AdjListItem, d3Graph } from '../interfaces';
import type BCPlugin from '../main';
import {
  getInNeighbours,
  getOutNeighbours,
  getSinks,
} from '../Utils/graphUtils';

export function graphlibToD3(g: Graph): d3Graph {
  const d3Graph: d3Graph = { nodes: [], links: [] };
  const nodeIDs = {};

  g.nodes().forEach((node, i) => {
    d3Graph.nodes.push({ id: i, name: node });
    nodeIDs[node] = i;
  });
  g.forEachEdge((k, a, s, t) => {
    d3Graph.links.push({
      source: nodeIDs[s],
      target: nodeIDs[t],
    });
  });

  return d3Graph;
}

export function bfsFromAllSinks(g: Graph) {
  const queue: string[] = getSinks(g);
  const adjList: AdjListItem[] = [];

  let i = 0;
  while (queue.length && i < 1000) {
    i++;

    const currNode = queue.shift();
    const newNodes = getInNeighbours(g, currNode);

    if (newNodes.length) {
      newNodes.forEach((pre) => {
        const next: AdjListItem = {
          name: currNode,
          parentId: pre,
          depth: i,
        };
        queue.push(pre);
        adjList.push(next);
      });
    } else {
      adjList.push({
        name: currNode,
        parentId: undefined,
        depth: i,
      });
    }
  }

  const maxDepth = adjList.sort((a, b) => a.depth - b.depth).last().depth;
  adjList.forEach((item) => (item.height = maxDepth - item.depth));
  return adjList;
}

export function dfsAdjList(g: Graph, startNode: string): AdjListItem[] {
  const queue: string[] = [startNode];
  const adjList: AdjListItem[] = [];

  let i = 0;
  while (queue.length && i < 1000) {
    i++;

    const currNode = queue.shift();
    const newNodes = getOutNeighbours(g, currNode);

    if (newNodes.length) {
      newNodes.forEach((succ) => {
        const next: AdjListItem = {
          name: currNode,
          parentId: succ,
          depth: i,
        };
        queue.push(succ);
        adjList.push(next);
      });
    } else {
      adjList.push({
        name: currNode,
        parentId: undefined,
        depth: i,
      });
    }
  }
  const maxDepth = adjList.sort((a, b) => a.depth - b.depth).last().depth;
  adjList.forEach((item) => (item.height = maxDepth - item.depth));

  return adjList;
}

export function bfsAdjList(g: Graph, startNode: string): AdjListItem[] {
  const queue: string[] = [startNode];
  const adjList: AdjListItem[] = [];

  let i = 0;
  while (queue.length && i < 1000) {
    i++;

    const currNode = queue.shift();
    const neighbours = {
      succs: getOutNeighbours(g, currNode),
      pres: getInNeighbours(g, currNode),
    };
    console.log({ currNode, neighbours });

    const next: AdjListItem = {
      name: currNode,
      pres: undefined,
      succs: undefined,
      parentId: i,
      depth: i,
    };
    if (neighbours.succs.length) {
      next.succs = neighbours.succs;
      queue.push(...neighbours.succs);
    }
    if (neighbours.pres.length) {
      next.pres = neighbours.pres;
    }
    adjList.push(next);
  }
  const maxDepth = adjList.sort((a, b) => a.depth - b.depth).last().depth;
  adjList.forEach((item) => (item.height = maxDepth - item.depth));

  return adjList;
}

export function dfsFlatAdjList(g: Graph, startNode: string) {
  const nodes = g.nodes();
  const nodeCount = nodes.length;
  const visits = {};
  nodes.forEach((node, i) => {
    visits[node] = nodeCount * i;
  });

  const queue: string[] = [startNode];
  const adjList: AdjListItem[] = [];

  let depth = 1;
  let i = 0;
  while (queue.length && i < 1000) {
    i++;

    const currNode = queue.shift();
    const next = getOutNeighbours(g, currNode);

    if (next.length) {
      queue.unshift(...next);
      next.forEach((succ) => {
        const parentId = nodeCount * nodes.indexOf(succ);
        if (
          !adjList.some(
            (adjItem) => adjItem.name === currNode && adjItem.parentId === parentId,
          )
        ) {
          adjList.push({
            id: visits[currNode] as number,
            name: currNode,
            parentId,
            depth,
          });
          visits[currNode]++;
        }
      });
      depth++;
    } else {
      adjList.push({
        id: visits[currNode] as number,
        name: currNode,
        parentId: 999999999,
        depth,
      });
      depth = 1;
      visits[currNode]++;
    }
  }
  adjList.push({
    id: 999999999,
    name: 'CONTAINER',
    parentId: undefined,
    depth: 0,
  });

  const maxDepth = adjList.sort((a, b) => a.depth - b.depth).last().depth;
  adjList.forEach((item) => (item.height = maxDepth - item.depth));

  console.log({ visits });
  return adjList;
}

export const stratify = d3
  .stratify()
  .id((d: AdjListItem) => {
    console.log({ d });
    return d.name;
  })
  .parentId((d: AdjListItem) => d.parentId);
export class VisModal extends Modal {
  plugin: BCPlugin;

  modal: VisModal;

  constructor(plugin: BCPlugin) {
    super(app);
    this.plugin = plugin;
    this.modal = this;
  }

  onOpen() {
    new Notice(
      'Alot of these features may not work, it is still very experimental.',
    );
    const { contentEl } = this;
    contentEl.empty();

    new VisComp({
      target: contentEl,
      props: {
        modal: this,
      },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

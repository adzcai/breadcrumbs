import Graph, { MultiGraph } from 'graphology';
import { dfsFromNode } from 'graphology-traversal';
import type { Attributes } from 'graphology-types';
import { info } from 'loglevel';
import type { App } from 'obsidian';
// import type BCPlugin from "../../main";
import {
  BC_I_REFLEXIVE,
  BC_ORDER,
  blankRealNImplied,
  DIRECTIONS,
} from '../constants';
import type {
  BCSettings,
  Directions,
  dvFrontmatterCache,
  EdgeAttr,
  NodePath,
  RealNImplied,
  UserHier,
} from '../interfaces';
import { getFieldInfo, getOppDir, getOppFields } from './HierUtils';
import { getBaseFromMDPath } from './ObsidianUtils';
import type BCPlugin from '../main';

// This function takes the real & implied graphs for a given relation, and returns a new graphs with both.
// It makes implied relations real
// TODO use reflexiveClosure instead
export function closeImpliedLinks(
  real: MultiGraph,
  implied: MultiGraph,
): MultiGraph {
  const closedG = real.copy();
  implied.forEachEdge((key, a, s, t) => {
    closedG.mergeEdge(t, s, a);
  });
  return closedG;
}
export function removeUnlinkedNodes(g: MultiGraph) {
  const copy = g.copy();
  copy.forEachNode((node) => {
    if (!copy.degree(node)) copy.dropNode(node);
  });
  return copy;
}

/**
 * Return a subgraph of all nodes & edges with `dirs.includes(a.dir)`
 *
 * Filter the given graph to only include edges in the given directions.
 * @param  {MultiGraph} g
 * @param  {Directions} dir
 */
export function getSubInDirs(g: MultiGraph, ...dirs: Directions[]) {
  const sub = new MultiGraph();
  g?.forEachEdge((k, a, s, t) => {
    if (dirs.includes(a.dir)) {
      // @ts-ignore
      addNodesIfNot(sub, [s, t], { order: a.order });
      sub.addEdge(s, t, a);
    }
  });
  return sub;
}

/**
 * Return a subgraph of all nodes & edges with `fields.includes(a.field)`.
 *
 * Filter the given graph to only include edges with the given fields.
 * @param  {MultiGraph} g
 * @param  {string[]} fields
 */
export function getSubForFields(g: MultiGraph, fields: string[]) {
  const sub = new MultiGraph();
  g.forEachEdge((k, a, s, t) => {
    if (fields.includes(a.field)) {
      // @ts-ignore
      addNodesIfNot(sub, [s, t], { order: a.order });
      sub.addEdge(s, t, a);
    }
  });
  return sub;
}

/**
 * For every edge in `g`, add the reverse of the edge to a copy of `g`.
 *
 * It also sets the attrs of the reverse edges to `oppDir` and `oppFields[0]`
 * @param  {MultiGraph} g
 * @param  {UserHier[]} userHiers
 * @param  {boolean} closeAsOpposite
 */
export function getReflexiveClosure(
  g: MultiGraph,
  userHiers: UserHier[],
): MultiGraph {
  const copy = g.copy();
  copy.forEachEdge((k, a, s, t) => {
    const { dir, field } = a;
    if (field === undefined) return;
    const oppDir = getOppDir(dir);
    const oppField = dir === 'same' ? field : getOppFields(userHiers, field, dir)[0];

    addNodesIfNot(copy, [s, t], { order: 9999 });
    addEdgeIfNot(copy, t, s, {
      dir: oppDir,
      field: oppField,
      implied: BC_I_REFLEXIVE,
    });
  });
  return copy;
}

/**
 * Adds nodes to the graph if they do not already exist.
 * If a node already exists, its order attribute will be updated if it is less than 9999.
 * @param g - The graph to add nodes to.
 * @param nodes - An array of node names to add.
 * @param attr - Optional attributes to assign to the nodes. Default is { order: 9999 }.
 */
export function addNodesIfNot(
  g: MultiGraph,
  nodes: string[],
  attr = { order: 9999 },
) {
  for (const node of nodes) {
    g.updateNode(node, (existingAttrs: Attributes) => {
      const currentOrder: number | undefined = existingAttrs.order;
      return {
        ...existingAttrs,
        order: currentOrder && currentOrder < 9999 ? currentOrder : attr.order,
      };
    });
  }
}

export function addEdgeIfNot(
  g: MultiGraph,
  source: string,
  target: string,
  attr?: Attributes,
) {
  if (!g.hasEdge(source, target)) g.addEdge(source, target, attr);
}

/**
 * Retrieves the sink nodes from a given graph.
 * A sink node is a node that has no outgoing edges.
 *
 * @param g - The graph to retrieve the sink nodes from.
 * @returns An array of sink nodes.
 */
export const getSinks = (g: MultiGraph) => g.filterNodes((node) => g.hasNode(node) && !g.outDegree(node));

/**
 * Retrieves the source nodes in a given graph.
 * A source node is defined as a node that has no incoming edges.
 *
 * @param g - The graph to retrieve the source nodes from.
 * @returns An array of source nodes.
 */
export const getSources = (g: MultiGraph) => g.filterNodes((node) => g.hasNode(node) && !g.inDegree(node));

export const getOutNeighbours = (g: MultiGraph, node: string) => (g.hasNode(node) ? g.outNeighbors(node) : []);
export const getInNeighbours = (g: MultiGraph, node: string) => (g.hasNode(node) ? g.inNeighbors(node) : []);

/**
 * Finds all paths from a starting node to all other sinks in a graph.
 *
 *
 * @param {MultiGraph} g - The graph to search
 * @param {string} start - The starting node
 * @returns An array of arrays. Each array is a path.
 */
export function dfsAllPaths(g: MultiGraph, start: string, maxRecurse = 1000): string[][] {
  const queue: NodePath[] = [{ node: start, path: [] }];
  const visited: { [note: string]: number } = {};
  const allPaths: string[][] = [];

  let i = 0;
  while (queue.length > 0 && i < maxRecurse) {
    i++;
    const { node, path } = queue.shift();

    const extPath = [node, ...path];
    const succsNotVisited = g.hasNode(node)
      ? g.filterOutNeighbors(
        node,
        (succ) => (visited[succ] ?? 0) < 5,
      )
      : [];
    const newItems = succsNotVisited.map((succ) => {
      visited[succ] = visited[succ] ? visited[succ] + 1 : 1;
      return { node: succ, path: extPath };
    });

    queue.unshift(...newItems);

    if (!g.hasNode(node) || !g.outDegree(node)) allPaths.push(extPath);
  }
  return allPaths;
}

export function bfsAllPaths(g: MultiGraph, start: string): string[][] {
  const pathsArr: string[][] = [];
  const queue: NodePath[] = [{ node: start, path: [] }];

  let i = 0;
  while (queue.length !== 0 && i < 1000) {
    i++;
    const { node, path } = queue.shift();
    const extPath = [node, ...path];

    const succs = g.hasNode(node)
      ? g.filterOutNeighbors(node, (n) => !path.includes(n))
      : [];
    for (const node of succs) {
      queue.push({ node, path: extPath });
    }

    // terminal node
    if (!g.hasNode(node) || succs.length === 0) {
      pathsArr.push(extPath);
    }
  }
  // Splice off the current note from the path
  pathsArr.forEach((path) => {
    if (path.length) path.splice(path.length - 1, 1);
  });
  info({ pathsArr });
  return pathsArr;
}

export function removeCycles(g: Graph, startNode: string) {
  const copy = g.copy();
  let prevNode = null;
  dfsFromNode(copy, startNode, (n) => {
    copy.forEachOutNeighbor(n, (t) => {
      if (t === prevNode && copy.hasEdge(t, prevNode)) {
        try { copy.dropEdge(t, prevNode); } catch (error) { console.error(t, prevNode, error); }
      }
    });

    prevNode = n;
  });
  return copy;
}

export function getSubCloseSub(
  g: MultiGraph,
  userHiers: UserHier[],
  ...dirs: Directions[]
) {
  const sub = getSubInDirs(g, ...dirs);
  const closed = getReflexiveClosure(sub, userHiers);
  const closedSub = getSubInDirs(closed, dirs[0]);
  return closedSub;
}

export function buildObsGraph(): MultiGraph {
  const ObsG = new MultiGraph();
  const { resolvedLinks, unresolvedLinks } = app.metadataCache;

  for (const source in resolvedLinks) {
    if (!source.endsWith('.md')) continue;
    const sourceBase = getBaseFromMDPath(source);
    addNodesIfNot(ObsG, [sourceBase]);

    for (const dest in resolvedLinks[source]) {
      if (!dest.endsWith('.md')) continue;
      const destBase = getBaseFromMDPath(dest);
      addNodesIfNot(ObsG, [destBase]);
      ObsG.addEdge(sourceBase, destBase, { resolved: true });
    }
  }

  for (const source in unresolvedLinks) {
    const sourceBase = getBaseFromMDPath(source);
    addNodesIfNot(ObsG, [sourceBase]);

    for (const dest in unresolvedLinks[source]) {
      const destBase = getBaseFromMDPath(dest);
      addNodesIfNot(ObsG, [destBase]);
      if (sourceBase === destBase) continue;
      ObsG.addEdge(sourceBase, destBase, { resolved: false });
    }
  }

  info({ ObsG });
  return ObsG;
}

export function populateMain(
  settings: BCSettings,
  mainG: MultiGraph,
  source: string,
  field: string,
  target: string,
  sourceOrder: number,
  targetOrder: number,
  fillOpp = false,
): void {
  const { userHiers } = settings;
  const dir = getFieldInfo(userHiers, field).fieldDir;

  addNodesIfNot(mainG, [source], {
    order: sourceOrder,
  });

  addNodesIfNot(mainG, [target], {
    order: targetOrder,
  });

  addEdgeIfNot(mainG, source, target, {
    dir,
    field,
  });
  if (fillOpp) {
    addEdgeIfNot(mainG, target, source, {
      dir: getOppDir(dir),
      field: getOppFields(userHiers, field, dir)[0],
    });
  }
}

export const getTargetOrder = (frontms: dvFrontmatterCache[], target: string) => parseInt(
  (frontms.find((ff) => ff?.file?.basename === target)?.[
    BC_ORDER
  ] as string) ?? '9999',
);

export const getSourceOrder = (frontm: dvFrontmatterCache) => parseInt((frontm[BC_ORDER] as string) ?? '9999');

/** Remember to filter by hierarchy in MatrixView! */
export function getRealnImplied(
  plugin: BCPlugin,
  currNode: string,
  dir: Directions = null,
): RealNImplied {
  const realsnImplieds: RealNImplied = blankRealNImplied();
  const { settings, closedG } = plugin;
  const { userHiers } = settings;

  if (!closedG.hasNode(currNode)) return realsnImplieds;
  closedG.forEachEdge(currNode, (k, a, s, t) => {
    const { field, dir: edgeDir, implied } = a as EdgeAttr;
    const oppField = getOppFields(userHiers, field, edgeDir)[0];

    (dir ? [dir, getOppDir(dir)] : DIRECTIONS).forEach(
      (currDir: Directions) => {
        const oppDir = getOppDir(currDir);
        // Reals
        if (s === currNode && (edgeDir === currDir || edgeDir === oppDir)) {
          const arr = realsnImplieds[edgeDir].reals;
          if (arr.findIndex((item) => item.to === t) === -1) {
            arr.push({ to: t, field, implied });
          }
        }
        // Implieds
        // If `s !== currNode` then `t` must be
        else if (edgeDir === currDir || edgeDir === oppDir) {
          const arr = realsnImplieds[getOppDir(edgeDir)].implieds;
          if (arr.findIndex((item) => item.to === s) === -1) {
            arr.push({
              to: s,
              field: oppField,
              implied,
            });
          }
        }
      },
    );
  });
  return realsnImplieds;
}

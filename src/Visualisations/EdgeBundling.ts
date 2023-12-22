import * as d3 from 'd3';
import type Graph from 'graphology';
import type { TFile } from 'obsidian';
import { dfsFlatAdjList, VisModal } from './VisModal';

export const edgeBundling = (
  graph: Graph,
  currFile: TFile,
  modal: VisModal,
  width: number,
  height: number,
) => {
  const flatAdj = dfsFlatAdjList(graph, currFile.basename);
  console.log({ flatAdj });

  const hier = d3.stratify()(flatAdj);
  console.log({ hier });

  const PADDING_BUBBLE = 15; // distance between edge end and bubble
  const PADDING_LABEL = 30; // distance between edge end and engineer name
  const BUBBLE_SIZE_MIN = 4;
  const BUBBLE_SIZE_MAX = 20;

  const diameter = 560;
  const radius = diameter / 2;
  const innerRadius = radius - 170; // between center and edge end

  // The 'cluster' function takes 1 argument as input. It also has methods (??) like cluster.separation(), cluster.size() and cluster.nodeSize()
  const cluster = d3.cluster().size([360, innerRadius]);

  const line = d3
    .lineRadial()
    .curve(d3.curveBundle.beta(0.85))
    .radius((d) => d[1])
    .angle((d) => (d[0] / 180) * Math.PI);

  const svg = d3
    .select('.d3-graph')
    .append('svg')
    .attr('height', height)
    .attr('width', width)
    .append('g')
    .attr('transform', `translate(${radius},${radius})`);

  const link = svg.append('g').selectAll('.link');
  const label = svg.append('g').selectAll('.label');
  const bubble = svg.append('g').selectAll('.bubble');

  // Add a scale for bubble size
  const bubbleSizeScale = d3
    .scaleLinear()
    .domain([0, 100])
    .range([BUBBLE_SIZE_MIN, BUBBLE_SIZE_MAX]);

  // Scale for the bubble size

  // If wanna see your data
  // console.log(hierarchicalData)

  // Reformat the data
  const root = packageHierarchy(hier)
    // debugger;
    .sum((d) => {
      console.log(d);
      return d.height;
    });

  // console.log(root)

  // Build an object that gives feature of each leaves
  cluster(root);
  const leaves = root.leaves();

  // Leaves is an array of Objects. 1 item = one leaf. Provides x and y for leaf position in the svg. Also gives details about its parent.
  const _link = link
    .data(packageImports(leaves))
    .enter()
    .append('path')
    .each((d) => {
      (d.source = d[0]), (d.target = d[d.length - 1]);
    })
    .attr('class', 'link')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', 'black');

  const _label = label
    .data(leaves)
    .enter()
    .append('text')
    .attr('class', 'label')
    .attr('dy', '0.31em')
    .attr('transform', (d) => (
      `rotate(${
        d.x - 90
      })translate(${
        d.y + PADDING_LABEL
      },0)${
        d.x < 180 ? '' : 'rotate(180)'}`
    ))
    .attr('text-anchor', (d) => (d.x < 180 ? 'start' : 'end'))
    .text((d) => d.data.key);

  const _bubble = bubble
    .data(leaves)
    .enter()
    .append('circle')
    .attr('class', 'bubble')
    .attr('transform', (d) => (
      `rotate(${d.x - 90})translate(${d.y + PADDING_BUBBLE},0)`
    ))
    .attr('r', (d) => bubbleSizeScale(d.value))
    .attr('stroke', 'black')
    .attr('fill', '#69a3b2')
    .style('opacity', 0.2);

  // Lazily construct the package hierarchy from class names.
  function packageHierarchy(classes) {
    const map = {};

    function find(name, data) {
      let node = map[name];
      let i;
      if (!node) {
        node = map[name] = data || { name, children: [] };
        if (name.length) {
          // @ts-ignore
          node.parent = find(name.substring(0, (i = name.lastIndexOf('.'))));
          node.parent.children.push(node);
          node.key = name.substring(i + 1);
        }
      }
      return node;
    }

    classes.forEach((d) => {
      find(d.name, d);
    });

    return d3.hierarchy(map['']);
  }

  // Return a list of imports for the given array of nodes.
  function packageImports(nodes) {
    const map = {};
    const imports = [];

    // Compute a map from name to node.
    nodes.forEach((d) => {
      map[d.data.name] = d;
    });

    // For each import, construct a link from the source to target node.
    nodes.forEach((d) => {
      if (d.data.imports) {
        d.data.imports.forEach((i) => {
          imports.push(map[d.data.name].path(map[i]));
        });
      }
    });

    return imports;
  }
};

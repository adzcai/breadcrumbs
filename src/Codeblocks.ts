import { info } from 'loglevel';
import { type MarkdownPostProcessorContext, Notice } from 'obsidian';
import { getAPI } from 'obsidian-dataview';
import { createIndex, indexToLinePairs } from './Commands/CreateIndex';
import CBTree from './Components/CBTree.svelte';
import { CODEBLOCK_FIELDS, CODEBLOCK_TYPES, DIRECTIONS } from './constants';
import type { CodeblockFields, ParsedCodeblock } from './interfaces';
import type BCPlugin from './main';
import {
  dropFolder, indentToDepth, parseAsBool, splitAndTrim,
} from './Utils/generalUtils';
import {
  dfsAllPaths,
  getReflexiveClosure,
  getSubForFields,
  getSubInDirs,
} from './Utils/graphUtils';
import { getFieldInfo, getFields, getOppDir } from './Utils/HierUtils';
import { createJuggl } from './Visualisations/Juggl';

function parseCodeBlockSource(source: string): ParsedCodeblock {
  const lines = source.split('\n');
  const getValue = (type: string) => lines
    .find((l) => l.startsWith(`${type}:`))
    ?.split(':')?.[1]
    ?.trim() ?? '';

  const results: { [field in CodeblockFields]: string | boolean | string[] } = {};

  CODEBLOCK_FIELDS.forEach((field) => {
    const value = getValue(field);
    results[field] = parseAsBool(value);
  });

  if (results.fields) {
    results.fields = splitAndTrim(results.fields as string);
  }

  if (results.depth) {
    const match = (results.depth as string).match(/(\d*)-?(\d*)/);
    if (!match) throw new Error('RegExp did not match');
    results.depth = [match[1], match[2]];
  }

  return results as unknown as ParsedCodeblock;
}

function codeblockError(plugin: BCPlugin, parsedSource: ParsedCodeblock) {
  const {
    dir, fields, type, title, depth, flat, content, from, implied,
  } = parsedSource;
  const { userHiers } = plugin.settings;
  let err = '';

  if (!CODEBLOCK_TYPES.includes(type)) {
    err += `<code>type: ${type}</code> is not a valid type. It must be one of: ${CODEBLOCK_TYPES.map(
      (t) => `<code>${t}</code>`,
    ).join(', ')}.</br>`;
  }

  const validDir = DIRECTIONS.includes(dir);
  if (!validDir) err += `<code>dir: ${dir}</code> is not a valid direction.</br>`;

  const allFields = getFields(userHiers);
  [fields].flat()?.forEach((f) => {
    if (f !== undefined && !allFields.includes(f)) err += `<code>fields: ${f}</code> is not a field in your hierarchies.</br>`;
  });

  if (title !== undefined && title !== false) err += `<code>title: ${title}</code> is not a valid value. It has to be <code>false</code>, or leave the entire line out.</br>`;

  if (depth !== undefined && depth.every((num) => Number.isNaN(Number.parseInt(num, 10)))) err += `<code>depth: ${depth}</code> is not a valid value. It has to be a number.</br>`;

  if (flat !== undefined && flat !== true) err += `<code>flat: ${flat}</code> is not a valid value. It has to be <code>true</code>, or leave the entire line out.</br>`;

  if (content !== undefined && content !== 'open' && content !== 'closed') err += `<code>content: ${content}</code> is not a valid value. It has to be <code>open</code> or <code>closed</code>, or leave the entire line out.</br>`;

  if (
    from !== undefined
    && !app.plugins.enabledPlugins.has('dataview')
  ) {
    err += 'Dataview must be enabled to use <code>from</code>.</br>';
  }

  if (implied !== undefined && implied !== false) err += `<code>implied: ${implied}</code> is not a valid value. It has to be <code>false</code>, or leave the entire line out.</br>`;

  return err === ''
    ? ''
    : `${err}</br>
    A valid example would be:
    <pre><code>
      type: tree
      dir: ${validDir ? dir : 'down'}
      fields: ${allFields
    .map((f) => ({ f, dir: getFieldInfo(userHiers, f).fieldDir }))
    .filter((i) => i.dir === dir)
    .map((i) => i.f)
    .join(', ') || 'child'
}
      depth: 3
      </code></pre>`;
}

export function meetsConditions(
  indent: string,
  node: string,
  froms: string[],
  min: number,
  max: number,
) {
  const depth = indentToDepth(indent);
  return (
    depth >= min
    && depth <= max
    && (froms === undefined || froms.includes(node))
  );
}

function createdJugglCB(
  plugin: BCPlugin,
  target: HTMLElement,
  args: ParsedCodeblock,
  lines: [string, string][],
  froms: string[],
  source: string,
  min: number,
  max: number,
) {
  const nodes = lines
    .filter(([indent, node]) => meetsConditions(indent, node, froms, min, max))
    .map(([, node]) => `${node}.md`);
  if (min <= 0) nodes.push(`${source}.md`);

  createJuggl(plugin, target, nodes, args);
}

export function getCodeblockCB(plugin: BCPlugin) {
  const { settings, db } = plugin;
  const { userHiers, createIndexIndent } = settings;

  return (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ) => {
    db.start2G('Codeblock');
    const parsedSource = parseCodeBlockSource(source);
    const err = codeblockError(plugin, parsedSource);

    if (err !== '') {
      el.innerHTML = err;
      db.end2G();
      return;
    }

    let min = 0;
    let max = Infinity;
    const {
      depth, dir, fields, from, implied, flat,
    } = parsedSource;
    if (depth !== undefined) {
      const minNum = Number.parseInt(depth[0], 10);
      if (!Number.isNaN(minNum)) min = minNum;
      const maxNum = Number.parseInt(depth[1], 10);
      if (!Number.isNaN(maxNum)) max = maxNum;
    }

    const currFile = app.metadataCache.getFirstLinkpathDest(
      ctx.sourcePath,
      '',
    );
    if (!currFile) throw new Error('Current file not found');
    const { basename } = currFile;

    let froms;
    if (from !== undefined) {
      try {
        const api = getAPI();
        if (api) {
          const pages = api.pagePaths(from)?.values;
          froms = pages.map(dropFolder);
        } else new Notice('Dataview must be enabled for `from` to work.');
      } catch (e) {
        new Notice(`The query "${from}" failed.`);
      }
    }

    const oppDir = getOppDir(dir);
    const sub = implied === false
      ? getSubInDirs(plugin.mainG, dir)
      : getSubInDirs(plugin.mainG, dir, oppDir);
    const closed = getReflexiveClosure(sub, userHiers);

    const subFields = fields ?? getFields(userHiers);
    const subClosed = getSubForFields(getSubInDirs(closed, dir), subFields);

    const allPaths = dfsAllPaths(subClosed, basename);
    const index = createIndex(allPaths, false, createIndexIndent);
    info({ allPaths, index });

    const lines = indexToLinePairs(index, flat);

    switch (parsedSource.type) {
      case 'tree':
        new CBTree({
          target: el,
          props: {
            plugin,
            el,
            min,
            max,
            lines,
            froms,
            basename,
            parsedSource,
          },
        });
        break;
      case 'juggl':
        createdJugglCB(
          plugin,
          el,
          parsedSource,
          lines,
          froms,
          basename,
          min,
          max,
        );
        break;
      default:
        throw new Error('Parsed source type not found');
    }

    db.end2G();
  };
}

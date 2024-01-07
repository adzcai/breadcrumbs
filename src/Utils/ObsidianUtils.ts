import { info } from 'loglevel';
import {
  type FrontMatterCache,
  parseYaml,
  stringifyYaml,
  TFile,
  TAbstractFile,
} from 'obsidian';
import {
  isInVault,
  wait,
  waitForResolvedLinks,
} from 'obsidian-community-lib/dist/utils';
import { getAPI } from 'obsidian-dataview';
import type { MetaeditApi } from '../interfaces';
import type BCPlugin from '../main';
import { splitAndTrim } from './generalUtils';

export const getSettings = () => app.plugins.plugins.breadcrumbs.settings;

export const getCurrFile = (): TFile | null => app.workspace.getActiveFile();

export function getFrontmatter(file: TFile) {
  const metadata = app.metadataCache.getFileCache(file);
  return metadata?.frontmatter;
}

/**
 * Get basename from a **Markdown** `path`
 * @param  {string} path
 */
export const getBaseFromMDPath = (path: string) => {
  const splitSlash = path.split('/').last()!;
  if (splitSlash.endsWith('.md')) {
    return splitSlash.split('.md').slice(0, -1).join('.');
  } return splitSlash;
};

export const getDVBasename = (file: TFile) => file.basename || file.name;
export const getFolderName = (file: TAbstractFile): string => file.parent?.name ?? '';

export function makeWiki(str: string, wikiQ = true) {
  let copy = str.slice();
  if (wikiQ) {
    copy = `[[${copy}`;
    copy += ']]';
  }
  return copy;
}

export function dropWikilinks(str: string) {
  let copy = str.slice();
  if (copy.startsWith('[[') && copy.endsWith(']]')) copy = copy.slice(2, -2);
  return copy;
}

/**
 * Adds or updates the given yaml `key` to `value` in the given TFile
 * @param  {string} key
 * @param  {string} value
 * @param  {TFile} file
 * @param  {FrontMatterCache|undefined} frontmatter
 * @param  {MetaeditApi} api
 */
export const createOrUpdateYaml = async (
  key: string,
  value: string,
  file: TFile,
  frontmatter: FrontMatterCache | undefined,
  api: MetaeditApi,
) => {
  const valueStr = value.toString();

  if (!frontmatter || frontmatter[key] === undefined) {
    info(`Creating: ${key}: ${valueStr}`);
    await api.createYamlProperty(key, `['${valueStr}']`, file);
  } else if (frontmatter[key].flat(3).some((val: any) => val === valueStr)) {
    info('Already Exists!');
  } else {
    const oldValueFlat: string[] = [...[frontmatter[key]]].flat(4);
    const newValue = [...oldValueFlat, `'${valueStr}'`];
    info(`Updating: ${key}: ${newValue}`);
    await api.update(key, `[${newValue.join(', ')}]`, file);
  }
};

export function changeYaml(yaml: string, key: string, newVal: string): string {
  if (yaml === '') {
    return `${key}: ['${newVal}']`;
  }
  const parsed: { [key: string]: any } = parseYaml(yaml);
  const value = parsed[key];
  if (value === undefined) {
    parsed[key] = newVal;
  } else if (typeof value === 'string' && value !== newVal) {
    parsed[key] = [value, newVal];
  } else if (
    typeof value?.[0] === 'string'
      && value.includes
      && !value.includes(newVal)
  ) {
    parsed[key] = [...value, newVal];
  }
  // else if (other types of values...)
  return stringifyYaml(parsed);
}

export function splitAtYaml(content: string): [string, string] {
  if (!content.startsWith('---\n')) return ['', content];

  const splits = content.split('---');
  return [
    `${splits.slice(0, 2).join('---')}---`,
    splits.slice(2).join('---'),
  ];
}

export const dropHash = (tag: string) => (tag.startsWith('#') ? tag.slice(1) : tag);

export const addHash = (tag: string) => (tag.startsWith('#') ? tag : `#${tag}`);

export function getAlt(node: string, plugin: BCPlugin): string | null {
  const { altLinkFields, showAllAliases } = plugin.settings;
  if (!altLinkFields.length) return null;

  const file = app.metadataCache.getFirstLinkpathDest(node, '');
  if (!file) return null;

  const frontmatter = getFrontmatter(file);
  if (!frontmatter) return null;

  // eslint-disable-next-line no-restricted-syntax
  for (const altField of altLinkFields) {
    const value = frontmatter[altField];
    const arr: string[] = typeof value === 'string' ? splitAndTrim(value) : value;
    if (value) return showAllAliases ? arr.join(', ') : arr[0];
  }
  return null;
}

export async function waitForCache() {
  if (app.plugins.enabledPlugins.has('dataview')) {
    let basename: string | undefined;
    while (!basename || !getAPI().page(basename)) {
      await wait(100);
      basename = getCurrFile()?.basename;
    }
  } else {
    await waitForResolvedLinks();
  }
}

export const linkClass = (to: string, realQ = true) => {
  let s = 'internal-link BC-Link';
  if (!isInVault(to)) s += ' is-resolved';
  if (!realQ) s += ' BC-Implied';
  return s;
};

export function isInsideYaml(): boolean | null {
  const { workspace } = app;
  const { activeLeaf } = workspace;
  if (!activeLeaf) return null;

  const {
    state: { mode },
  } = activeLeaf.getViewState();

  if (mode !== 'source') return null;

  const { editor } = activeLeaf.view;

  const file = getCurrFile();
  if (!file) return null;

  const frontmatter = getFrontmatter(file);
  if (!frontmatter) return false;

  const { start, end } = frontmatter.position;
  const currOff = editor.posToOffset(editor.getCursor());
  if (currOff >= start.offset && currOff <= end.offset) return true;
  return false;
}

import type { MultiGraph } from 'graphology';
import { ARROW_DIRECTIONS, DIRECTIONS } from './constants';
import type { BCAPII, Directions, UserHier } from './interfaces';
import type BCPlugin from './main';
import { getMatrixNeighbours } from './Views/MatrixView';
import {
  buildObsGraph,
  dfsAllPaths,
  getSubForFields,
  getSubInDirs,
} from './Utils/graphUtils';
import {
  getFieldInfo,
  getFields,
  getOppDir,
  getOppFields,
  iterateHiers,
} from './Utils/HierUtils';
import { createIndex } from './Commands/CreateIndex';
import { refreshIndex } from './refreshIndex';
import { getCurrFile } from './Utils/ObsidianUtils';

export class BCAPI implements BCAPII {
  plugin: BCPlugin;

  mainG: MultiGraph;

  closedG: MultiGraph;

  public constructor(plugin: BCPlugin) {
    this.plugin = plugin;
    this.mainG = this.plugin.mainG;
    this.closedG = this.plugin.closedG;
  }

  public DIRECTIONS = DIRECTIONS;

  public ARROW_DIRECTIONS = ARROW_DIRECTIONS;

  public buildObsGraph = buildObsGraph;

  public refreshIndex = async () => refreshIndex(this.plugin);

  public getSubInDirs = (dirs: Directions[], g = this.mainG) => getSubInDirs(g, ...dirs);

  public getSubForFields = (fields: string[], g = this.mainG) => getSubForFields(g, fields);

  public dfsAllPaths = (
    fromNode = getCurrFile()?.basename,
    g = this.mainG,
  ) => dfsAllPaths(g, fromNode);

  public createIndex = (allPaths: string[][], wikilinks = false, indent = '  ') => createIndex(allPaths, wikilinks, indent);

  public getMatrixNeighbours = (
    fromNode = getCurrFile()?.basename,
  ) => getMatrixNeighbours(this.plugin, fromNode);

  public getOppDir = (dir: Directions) => getOppDir(dir);

  public getOppFields = (field: string) => {
    const { fieldDir } = getFieldInfo(this.plugin.settings.userHiers, field);
    return getOppFields(this.plugin.settings.userHiers, field, fieldDir);
  };

  public getFieldInfo = (field: string) => getFieldInfo(this.plugin.settings.userHiers, field);

  public getFields = (dir?: Directions) => getFields(this.plugin.settings.userHiers, dir ?? 'all');

  public iterateHiers(
    cb: (hier: UserHier, dir: Directions, field: string) => void,
  ) {
    iterateHiers(this.plugin.settings.userHiers, cb);
  }
}

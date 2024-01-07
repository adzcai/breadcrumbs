import type { MultiGraph } from 'graphology';
import { warn } from 'loglevel';
import { Notice } from 'obsidian';
import {
  BC_DV_NOTE, BC_DV_NOTE_FIELD, BC_IGNORE, DATAVIEW_MISSING,
} from '../constants';
import type { dvFrontmatterCache } from '../interfaces';
import type BCPlugin from '../main';
import {
  getSourceOrder,
  getTargetOrder,
  populateMain,
} from '../Utils/graphUtils';
import { getFields } from '../Utils/HierUtils';
import { getDVBasename } from '../Utils/ObsidianUtils';
import { getAPI } from 'obsidian-dataview';

export function addDataviewNotesToGraph(
  plugin: BCPlugin,
  eligableAlts: dvFrontmatterCache[],
  frontms: dvFrontmatterCache[],
  mainG: MultiGraph,
) {
  const { settings } = plugin;
  const { userHiers, dataviewNoteField } = settings;
  const dv = getAPI();
  if (!dv && eligableAlts.length) {
    new Notice(DATAVIEW_MISSING);
    return;
  }

  const fields = getFields(userHiers);

  eligableAlts.forEach((altFile) => {
    const basename = getDVBasename(altFile.file);

    let query = altFile[BC_DV_NOTE] as (string | Record<string, string>);
    if (query.hasOwnProperty('path')) {
      // @ts-ignore
      query = `[[${query.path}]]`;
    }

    const field = (altFile[BC_DV_NOTE_FIELD] as string) ?? (dataviewNoteField || fields[0]);

    let targets: dvFrontmatterCache[] = [];
    try {
      targets = dv.pages(<string>query).values;
    } catch (er) {
      new Notice(`${query} is not a valid Dataview from-query`);
      warn(er);
    }

    for (const target of targets) {
      if (target[BC_IGNORE]) continue;
      const targetBN = getDVBasename(target.file);
      const sourceOrder = getSourceOrder(altFile);
      const targetOrder = getTargetOrder(frontms, targetBN);

      populateMain(
        settings,
        mainG,
        basename,
        field,
        targetBN,
        sourceOrder,
        targetOrder,
        true,
      );
    }
  });
}

import type { MultiGraph } from 'graphology';
import { BC_LINK_NOTE } from '../constants';
import type { dvFrontmatterCache } from '../interfaces';
import type BCPlugin from '../main';
import {
  getSourceOrder,
  getTargetOrder,
  populateMain,
} from '../Utils/graphUtils';
import { getFields } from '../Utils/HierUtils';
import { getDVBasename } from '../Utils/ObsidianUtils';

export function addLinkNotesToGraph(
  plugin: BCPlugin,
  eligableAlts: dvFrontmatterCache[],
  frontms: dvFrontmatterCache[],
  mainG: MultiGraph,
) {
  const { settings } = plugin;
  const { userHiers } = settings;
  const fields = getFields(userHiers);
  eligableAlts.forEach((altFile) => {
    const linkNoteFile = altFile.file;
    const linkNoteBasename = getDVBasename(linkNoteFile);

    const field = altFile[BC_LINK_NOTE] as string;
    if (typeof field !== 'string' || !fields.includes(field)) return;

    const links = app.metadataCache
      .getFileCache(linkNoteFile)
      ?.links?.map((l) => l.link.match(/[^#|]+/)[0]);

    const embeds = app.metadataCache
      .getFileCache(linkNoteFile)
      ?.embeds?.map((l) => l.link.match(/[^#|]+/)[0]);

    const targets = [...(links ?? []), ...(embeds ?? [])];

    for (const target of targets) {
      const sourceOrder = getSourceOrder(altFile);
      const targetOrder = getTargetOrder(frontms, linkNoteBasename);
      populateMain(
        settings,
        mainG,
        linkNoteBasename,
        field,
        target,
        sourceOrder,
        targetOrder,
        true,
      );
    }
  });
}

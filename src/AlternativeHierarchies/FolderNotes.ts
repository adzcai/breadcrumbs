import type { MultiGraph } from 'graphology';
import { TFile, TFolder } from 'obsidian';
import {
  BC_FOLDER_NOTE,
  BC_FOLDER_NOTE_RECURSIVE,
  BC_FOLDER_NOTE_SUBFOLDERS,
  BC_IGNORE,
} from '../constants';
import type { dvFrontmatterCache } from '../interfaces';
import type BCPlugin from '../main';
import {
  getSourceOrder,
  getTargetOrder,
  populateMain,
} from '../Utils/graphUtils';
import { getFields } from '../Utils/HierUtils';
import { getDVBasename, getFolderName } from '../Utils/ObsidianUtils';

const getFolderChildren = (folder: TFolder) => {
  const files: TFile[] = [];
  const folders: TFolder[] = [];
  folder.children.forEach((file) => {
    if (file instanceof TFile) files.push(file);
    else folders.push(file as TFolder);
  });
  return { files, folders };
};

export function addFolderNotesToGraph(
  plugin: BCPlugin,
  folderNotes: dvFrontmatterCache[],
  frontms: dvFrontmatterCache[],
  mainG: MultiGraph,
) {
  const { settings } = plugin;
  const { userHiers } = settings;
  const fields = getFields(userHiers);

  folderNotes.forEach((altFile) => {
    const { file } = altFile;
    const basename = getDVBasename(file);
    const topFolderName = getFolderName(file);
    const topFolder = app.vault.getAbstractFileByPath(topFolderName) as TFolder;

    const targets = frontms
      .map((ff) => ff.file)
      .filter(
        (other) => getFolderName(other) === topFolderName
        && other.path !== file.path
        && !(other as any)[BC_IGNORE],
      )
      .map(getDVBasename);

    const field = altFile[BC_FOLDER_NOTE] as string;
    if (typeof field !== 'string' || !fields.includes(field)) return;

    targets.forEach((target) => {
      // This is getting the order of the folder note, not the source pointing up to it
      const sourceOrder = getSourceOrder(altFile);
      const targetOrder = getTargetOrder(frontms, basename);
      populateMain(
        settings,
        mainG,
        basename,
        field,
        target,
        sourceOrder,
        targetOrder,
        true,
      );
    });

    if (altFile[BC_FOLDER_NOTE_SUBFOLDERS]) {
      const subfolderField = altFile[BC_FOLDER_NOTE_SUBFOLDERS] as string;
      if (
        typeof subfolderField !== 'string'
        || !fields.includes(subfolderField)
      ) return;

      const { folders: subFolders } = getFolderChildren(topFolder);

      subFolders.forEach((subFolder) => {
        subFolder.children.forEach((child) => {
          if (child instanceof TFile) {
            const childBasename = getDVBasename(child);

            populateMain(
              settings,
              mainG,
              basename,
              subfolderField,
              childBasename,
              9999,
              9999,
              true,
            );
          }
        });
      });
    }

    if (altFile[BC_FOLDER_NOTE_RECURSIVE]) {
      const { folders: subFolders } = getFolderChildren(topFolder);
      const folderQueue: TFolder[] = [...subFolders];

      let currFolder = folderQueue.shift();
      while (currFolder !== undefined) {
        const { files: currFiles, folders: currSubFolders } = getFolderChildren(currFolder);

        const folderNote = currFolder.name;
        const currTargets = currFiles.map(getDVBasename);

        // if (!isInVault( folderNote, folderNote)) continue;

        const sourceOrder = 9999; // getSourceOrder(altFile);
        const targetOrder = 9999; //  getTargetOrder(frontms, basename);

        const parentFolderNote = getFolderName(currFolder);

        populateMain(
          settings,
          mainG,
          parentFolderNote,
          field,
          folderNote,
          sourceOrder,
          targetOrder,
          true,
        );

        currTargets.forEach((target) => {
          if (target === folderNote) return;

          populateMain(
            settings,
            mainG,
            folderNote,
            field,
            target,
            9999, // getSourceOrder(altFile)
            9999, //  getTargetOrder(frontms, basename)
            true,
          );
        });

        folderQueue.push(...currSubFolders);
        currFolder = folderQueue.shift();
      }
    }

    // First add otherNotes to graph

    // Then iterate subFolders doing the same
  });
}

import type { MultiGraph } from 'graphology';
import { getPlugin } from 'juggl-api';
import {
  addIcon, type EventRef, MarkdownView, Plugin,
} from 'obsidian';
import {
  openView,
  wait,
} from 'obsidian-community-lib/dist/utils';
import { Debugger } from 'src/Debugger';
import { BCAPI } from './API';
import { HierarchyNoteSelectorModal } from './AlternativeHierarchies/HierarchyNotes/HierNoteModal';
import { getCodeblockCB } from './Codeblocks';
import { copyGlobalIndex, copyLocalIndex } from './Commands/CreateIndex';
import { jumpToFirstDir } from './Commands/jumpToFirstDir';
import { thread } from './Commands/threading';
import { writeBCsToAllFiles, writeBCToFile } from './Commands/WriteBCs';
import {
  DEFAULT_SETTINGS,
  DUCK_ICON,
  DUCK_ICON_SVG,
  DUCK_VIEW,
  MATRIX_VIEW,
  TRAIL_ICON,
  TRAIL_ICON_SVG,
  TREE_VIEW,
  API_NAME,
} from './constants';
import { FieldSuggestor } from './FieldSuggestor';
import type {
  BCAPII,
  BCSettings,
  Directions,
  MyView,
  ViewInfo,
} from './interfaces';
import { buildClosedG, buildMainG, refreshIndex } from './refreshIndex';
import { RelationSuggestor } from './RelationSuggestor';
import { BCSettingTab } from './Settings/BreadcrumbsSettingTab';
import { getFields } from './Utils/HierUtils';
import { waitForCache } from './Utils/ObsidianUtils';
import DucksView from './Views/DucksView';
import MatrixView from './Views/MatrixView';
import { drawTrail } from './Views/TrailView';
import TreeView from './Views/TreeView';
import { BCStore } from './Visualisations/Juggl';

export default class BCPlugin extends Plugin {
  settings!: BCSettings;

  visited: [string, HTMLDivElement][] = [];

  mainG!: MultiGraph;

  closedG!: MultiGraph;

  activeLeafChange?: EventRef = undefined;

  layoutChange?: EventRef = undefined;

  db!: Debugger;

  VIEWS!: ViewInfo[];

  api!: BCAPII;

  private bcStore!: BCStore;

  registerActiveLeafChangeEvent() {
    this.activeLeafChange = app.workspace.on(
      'file-open',
      async () => {
        if (this.settings.refreshOnNoteChange) await refreshIndex(this);
        else {
          const activeView = this.getActiveViewType(MATRIX_VIEW);
          if (activeView) await activeView.draw();
        }
      },
    );
    this.registerEvent(this.activeLeafChange);
  }

  registerLayoutChangeEvent() {
    this.layoutChange = app.workspace.on('layout-change', async () => {
      if (this.settings.showBCs) await drawTrail(this);
    });
    this.registerEvent(this.layoutChange);
  }

  async onload(): Promise<void> {
    console.log('loading breadcrumbs plugin');

    await this.loadSettings();
    this.addSettingTab(new BCSettingTab(this));

    this.db = new Debugger(this);

    const { settings } = this;
    const {
      fieldSuggestor,
      enableRelationSuggestor,
      openMatrixOnLoad,
      openDuckOnLoad,
      openDownOnLoad,
      showBCs,
      userHiers,
    } = settings;

    if (fieldSuggestor) this.registerEditorSuggest(new FieldSuggestor(this));
    if (enableRelationSuggestor) this.registerEditorSuggest(new RelationSuggestor(this));

    // Migrate older versions of these settings
    if (settings.limitTrailCheckboxes.length === 0) {
      settings.limitTrailCheckboxes = getFields(settings.userHiers);
    }
    if (typeof settings.showAll === 'boolean') {
      settings.showAll = settings.showAll ? 'All' : 'Shortest';
    }

    this.VIEWS = [
      {
        plain: 'Matrix',
        type: MATRIX_VIEW,
        constructor: MatrixView,
        openOnLoad: openMatrixOnLoad,
      },
      {
        plain: 'Duck',
        type: DUCK_VIEW,
        constructor: DucksView,
        openOnLoad: openDuckOnLoad,
      },
      {
        plain: 'Down',
        type: TREE_VIEW,
        constructor: TreeView,
        openOnLoad: openDownOnLoad,
      },
    ];

    this.VIEWS.forEach(({ constructor, type }) => {
      this.registerView(type, (leaf) => new (constructor as any)(leaf, this));
    });

    addIcon(DUCK_ICON, DUCK_ICON_SVG);
    addIcon(TRAIL_ICON, TRAIL_ICON_SVG);

    await waitForCache();
    this.mainG = await buildMainG(this);
    this.closedG = buildClosedG(this);

    app.workspace.onLayoutReady(async () => {
      const noFiles = app.vault.getMarkdownFiles().length;
      if (this.mainG?.nodes().length < noFiles) {
        await wait(3000);
        this.mainG = await buildMainG(this);
        this.closedG = buildClosedG(this);
      }

      await Promise.all(this.VIEWS.map(async ({ openOnLoad, type, constructor }) => {
        if (openOnLoad) {
          await openView(type, constructor as any);
        }
      }));

      if (showBCs) await drawTrail(this);
      this.registerActiveLeafChangeEvent();
      this.registerLayoutChangeEvent();

      // Source for save setting
      // https://github.com/hipstersmoothie/obsidian-plugin-prettier/blob/main/src/main.ts
      const saveCommandDefinition = app.commands.commands['editor:save-file'];
      const save = saveCommandDefinition?.callback;

      if (typeof save === 'function') {
        saveCommandDefinition.callback = async () => {
          await save();
          if (this.settings.refreshOnNoteSave) {
            await refreshIndex(this);
            const activeView = this.getActiveViewType(MATRIX_VIEW);
            if (activeView) await activeView.draw();
          }
        };
      }

      app.workspace.iterateAllLeaves((leaf) => {
        if (leaf instanceof MarkdownView) {
          (leaf.view as any).previewMode.rerender(true);
        }
      });
    });

    this.VIEWS.forEach(({ type, plain, constructor }) => {
      this.addCommand({
        id: `show-${type}-view`,
        name: `Open ${plain} View`,
        callback: () => {
          console.log('Opening', plain);
          return openView(type, constructor as any);
        },
      });
    });

    this.addCommand({
      id: 'manipulate-hierarchy-notes',
      name: 'Adjust Hierarchy Notes',
      callback: () => new HierarchyNoteSelectorModal(this).open(),
    });

    this.addCommand({
      id: 'Refresh-Breadcrumbs-Index',
      name: 'Refresh Breadcrumbs Index',
      callback: async () => refreshIndex(this),
    });

    this.addCommand({
      id: 'Toggle-trail-in-Edit&LP',
      name: 'Toggle: Show Trail/Grid in Edit & LP mode',
      callback: async () => {
        settings.showBCsInEditLPMode = !settings.showBCsInEditLPMode;
        await this.saveSettings();
        await drawTrail(this);
      },
    });

    this.addCommand({
      id: 'Write-Breadcrumbs-to-Current-File',
      name: 'Write Breadcrumbs to Current File',
      callback: async () => writeBCToFile(this),
    });

    this.addCommand({
      id: 'Write-Breadcrumbs-to-All-Files',
      name: 'Write Breadcrumbs to **ALL** Files',
      callback: async () => writeBCsToAllFiles(this),
    });

    this.addCommand({
      id: 'local-index',
      name: 'Copy a Local Index to the clipboard',
      callback: async () => copyLocalIndex(this),
    });

    this.addCommand({
      id: 'global-index',
      name: 'Copy a Global Index to the clipboard',
      callback: async () => copyGlobalIndex(this),
    });

    (<Directions[]>['up', 'down', 'next', 'prev']).forEach((dir: Directions) => {
      this.addCommand({
        id: `jump-to-first-${dir}`,
        name: `Jump to first '${dir}'`,
        callback: async () => jumpToFirstDir(this, dir),
      });
    });

    getFields(userHiers).forEach((field: string) => {
      this.addCommand({
        id: `new-file-with-curr-as-${field}`,
        name: `Create a new '${field}' from the current note`,
        callback: async () => thread(this, field),
      });
    });

    this.registerMarkdownCodeBlockProcessor(
      'breadcrumbs',
      getCodeblockCB(this),
    );

    const jugglPlugin = getPlugin(app);
    if (jugglPlugin) {
      this.bcStore = new BCStore(this.mainG, app.metadataCache);
      jugglPlugin.registerStore(this.bcStore);
    }

    this.api = new BCAPI(this);
    // Register API to global window object.
    (<any>window)[API_NAME] = this.api;
    if (this.api) {
      this.register(() => delete (<any>window)[API_NAME]);
    }
  }

  getActiveViewType(type: string): MyView | null {
    const view = this.VIEWS.find((v) => v.type === type);
    if (!view) return null;
    const { constructor } = view;
    const leaves = app.workspace.getLeavesOfType(type);
    if (leaves && leaves.length >= 1) {
      const v = leaves[0].view;
      if (v instanceof constructor) return v;
    }
    return null;
  }

  loadSettings = async () => {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...await this.loadData(),
    };
  };

  saveSettings = async () => this.saveData(this.settings);

  onunload(): void {
    console.log('unloading breadcrumbs');
    this.VIEWS.forEach(async (view) => {
      app.workspace.getLeavesOfType(view.type).forEach((leaf) => {
        leaf.detach();
      });
    });

    this.visited.forEach((visit) => visit[1].remove());
    if (this.bcStore) {
      const jugglPlugin = getPlugin(app);
      if (jugglPlugin) {
        // @ts-ignore
        jugglPlugin.removeStore(this.bcStore);
      }
    }
  }
}

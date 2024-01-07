import 'obsidian';
import type { DataviewApi } from 'obsidian-dataview';

declare namespace obsidian {
  interface App {
    plugins: {
      enabledPlugins: Set<string>;
      plugins: {
        [id: string]: any;
        juggl: any;
      };
    };
  }
  interface MetadataCache {
    on(
      name: 'dataview:api-ready',
      callback: (api: DataviewPlugin['api']) => any,
      ctx?: any
    ): EventRef;
    on(
      name: 'dataview:metadata-change',
      callback: (
        ...args:
        | [op: 'rename', file: TAbstractFile, oldPath: string]
        | [op: 'delete', file: TFile]
        | [op: 'update', file: TFile]
      ) => any,
      ctx?: any
    ): EventRef;
  }
}

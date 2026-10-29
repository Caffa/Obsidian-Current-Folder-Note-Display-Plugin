import { Plugin, TFile } from 'obsidian';
import type { App, HeadingCache } from 'obsidian';

export const HEADING_CORE_KEY = '__headingComputeCore';
export const HEADING_CORE_UPDATED = 'heading-core-updated';
export const HEADING_CORE_CLAIMED = 'heading-core-claimed';

export interface HeadingCoreApi {
  ownerId: string;
  priority: number;
  getRawHeadings(file: TFile): HeadingCache[];
  getSignature(file: TFile): string;
  subscribe(file: TFile, callback: (headings: HeadingCache[]) => void): () => void;
  notify(file: TFile): void;
  release(): void;
}

export interface HeadingCoreOwnerOptions {
  onResolve?: (file: TFile) => void | Promise<void>;
  onFileChange?: (file: TFile) => void | Promise<void>;
}

interface HeadingCoreGlobal {
  ownerId: string;
  priority: number;
  api: HeadingCoreApi;
}

function isMarkdownFile(file: TFile, app: App): boolean {
  return Boolean(file && file.extension && ['md', 'markdown'].includes(file.extension));
}

export function getRawHeadings(file: TFile, app: App): HeadingCache[] {
  try {
    const cache = app.metadataCache.getFileCache(file);
    if (cache?.headings) {
      return cache.headings;
    }
  } catch {
    // fall through to empty
  }
  return [];
}

export function computeHeadingSignature(file: TFile, app: App): string {
  try {
    const headings = app.metadataCache.getFileCache(file)?.headings;
    if (!headings || headings.length === 0) {
      return '';
    }
    return headings.map(h => `${h.level}|${h.heading}`).join('\n');
  } catch {
    return '';
  }
}

class HeadingCoreOwner {
  private plugin: Plugin;
  private pluginId: string;
  private priority: number;
  private app: App;
  private options: HeadingCoreOwnerOptions;

  private resolveRef: any = null;
  private createRef: any = null;
  private deleteRef: any = null;
  private renameRef: any = null;
  private modifyRef: any = null;

  private subscribers: Map<string, Set<(headings: HeadingCache[]) => void>> = new Map();
  private headingCache: Map<string, string> = new Map();

  api: HeadingCoreApi;

  constructor(plugin: Plugin, pluginId: string, priority: number, options?: HeadingCoreOwnerOptions) {
    this.plugin = plugin;
    this.pluginId = pluginId;
    this.priority = priority;
    this.app = plugin.app;
    this.options = options ?? {};

    this.api = {
      ownerId: pluginId,
      priority,
      getRawHeadings: (file: TFile) => this.getRawHeadings(file),
      getSignature: (file: TFile) => this.getSignature(file),
      subscribe: (file: TFile, callback) => this.subscribe(file, callback),
      notify: (file: TFile) => this.notify(file),
      release: () => this.release(),
    };
  }

  start(): void {
    try {
      this.resolveRef = this.app.metadataCache.on('resolve', (file: TFile) => {
        if (!file || !isMarkdownFile(file, this.app)) return;
        const previous = this.headingCache.get(file.path);
        const signature = this.getSignature(file);
        const changed = previous !== signature;
        this.headingCache.set(file.path, signature);
        this.notifyIfChanged(file, changed);
        void (async () => {
          try {
            await this.options.onResolve?.(file);
          } catch (error) {
            console.warn('[heading-core] onResolve hook failed:', error);
          }
        })();
      });
      this.plugin.registerEvent(this.resolveRef);
    } catch (error) {
      console.warn('[heading-core] failed to register metadata resolve:', error);
    }

    try {
      this.createRef = this.app.vault.on('create', (file) => {
        if (!(file instanceof TFile) || !isMarkdownFile(file, this.app)) return;
        this.headingCache.delete(file.path);
        this.notify(file);
        void this.options.onFileChange?.(file);
      });
      this.plugin.registerEvent(this.createRef);
    } catch (error) {
      console.warn('[heading-core] failed to register vault create:', error);
    }

    try {
      this.deleteRef = this.app.vault.on('delete', (file) => {
        if (!(file instanceof TFile) || !isMarkdownFile(file, this.app)) return;
        this.headingCache.delete(file.path);
        this.subscribers.delete(file.path);
      });
      this.plugin.registerEvent(this.deleteRef);
    } catch (error) {
      console.warn('[heading-core] failed to register vault delete:', error);
    }

    try {
      this.renameRef = this.app.vault.on('rename', (file, oldPath) => {
        if (!(file instanceof TFile) || !isMarkdownFile(file, this.app)) return;
        const cached = this.headingCache.get(oldPath);
        if (cached !== undefined) {
          this.headingCache.delete(oldPath);
          this.headingCache.set(file.path, cached);
        }
        const subs = this.subscribers.get(oldPath);
        if (subs) {
          this.subscribers.delete(oldPath);
          this.subscribers.set(file.path, subs);
        }
        this.notify(file);
        void this.options.onFileChange?.(file);
      });
      this.plugin.registerEvent(this.renameRef);
    } catch (error) {
      console.warn('[heading-core] failed to register vault rename:', error);
    }

    try {
      this.modifyRef = this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile) || !isMarkdownFile(file, this.app)) return;
        this.headingCache.delete(file.path);
      });
      this.plugin.registerEvent(this.modifyRef);
    } catch (error) {
      console.warn('[heading-core] failed to register vault modify:', error);
    }
  }

  private notifyIfChanged(file: TFile, changed: boolean): void {
    if (!changed) return;
    this.dispatchUpdated(file);
    const subs = this.subscribers.get(file.path);
    if (subs) {
      const headings = this.getRawHeadings(file);
      for (const cb of subs) {
        try {
          cb(headings);
        } catch (error) {
          console.warn('[heading-core] subscriber callback failed:', error);
        }
      }
    }
  }

  getRawHeadings(file: TFile): HeadingCache[] {
    const direct = getRawHeadings(file, this.app);
    this.headingCache.set(file.path, this.getSignature(file));
    return direct;
  }

  getSignature(file: TFile): string {
    const sig = computeHeadingSignature(file, this.app);
    this.headingCache.set(file.path, sig);
    return sig;
  }

  subscribe(file: TFile, callback: (headings: HeadingCache[]) => void): () => void {
    if (!this.subscribers.has(file.path)) {
      this.subscribers.set(file.path, new Set());
    }
    this.subscribers.get(file.path)!.add(callback);
    try {
      callback(this.getRawHeadings(file));
    } catch (error) {
      console.warn('[heading-core] initial subscriber push failed:', error);
    }
    return () => {
      this.subscribers.get(file.path)?.delete(callback);
    };
  }

  notify(file: TFile): void {
    this.dispatchUpdated(file);
    const subs = this.subscribers.get(file.path);
    if (subs) {
      const headings = this.getRawHeadings(file);
      for (const cb of subs) {
        try {
          cb(headings);
        } catch (error) {
          console.warn('[heading-core] notify subscriber failed:', error);
        }
      }
    }
  }

  private dispatchUpdated(file: TFile): void {
    try {
      window.dispatchEvent(new CustomEvent(HEADING_CORE_UPDATED, { detail: { path: file.path } }));
    } catch (error) {
      console.warn('[heading-core] dispatch failed:', error);
    }
  }

  release(): void {
    try { if (this.resolveRef) this.app.metadataCache.offref(this.resolveRef); } catch {}
    try { if (this.createRef) this.app.vault.offref(this.createRef); } catch {}
    try { if (this.deleteRef) this.app.vault.offref(this.deleteRef); } catch {}
    try { if (this.renameRef) this.app.vault.offref(this.renameRef); } catch {}
    try { if (this.modifyRef) this.app.vault.offref(this.modifyRef); } catch {}

    this.resolveRef = null;
    this.createRef = null;
    this.deleteRef = null;
    this.renameRef = null;
    this.modifyRef = null;

    const global = (window as any)[HEADING_CORE_KEY];
    if (global && global.api === this.api) {
      delete (window as any)[HEADING_CORE_KEY];
      window.dispatchEvent(new CustomEvent(HEADING_CORE_CLAIMED, { detail: { ownerId: null } }));
    }
  }
}

export function claimOrUseHeadingCore(
  plugin: Plugin,
  pluginId: string,
  priority: number,
  options?: HeadingCoreOwnerOptions
): { api: HeadingCoreApi; isOwner: boolean } {
  const existing = (window as any)[HEADING_CORE_KEY] as HeadingCoreGlobal | undefined;

  if (existing && existing.priority < priority && existing.api.ownerId !== pluginId) {
    return { api: existing.api, isOwner: false };
  }

  if (existing && existing.priority > priority && existing.api.ownerId !== pluginId) {
    try {
      existing.api.release();
    } catch (error) {
      console.warn('[heading-core] failed to release previous owner:', error);
    }
  }

  if (existing && existing.api.ownerId === pluginId) {
    return { api: existing.api, isOwner: true };
  }

  const owner = new HeadingCoreOwner(plugin, pluginId, priority, options);
  (window as any)[HEADING_CORE_KEY] = {
    ownerId: pluginId,
    priority,
    api: owner.api,
  };

  owner.start();

  window.dispatchEvent(new CustomEvent(HEADING_CORE_CLAIMED, { detail: { ownerId: pluginId } }));

  return { api: owner.api, isOwner: true };
}

export function getHeadingCoreApi(): HeadingCoreApi | null {
  const global = (window as any)[HEADING_CORE_KEY] as HeadingCoreGlobal | undefined;
  return global?.api ?? null;
}

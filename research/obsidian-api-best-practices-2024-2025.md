# Obsidian Plugin API Research Report: 2024-2025 Best Practices

## Executive Summary

This report analyzes the Current Folder Notes plugin code against the latest Obsidian Plugin API (v1.13.0+) and identifies key areas for modernization, performance optimization, and adherence to current best practices.

---

## 1. View/Leaf Lifecycle Changes

### Current State
The plugin uses standard `registerView` and manages a `leaves` array manually:
```typescript
public leaves: WorkspaceLeaf[] = [];
```

### Recommended Changes

**No Major Deprecations**: The `registerView` pattern remains the standard and recommended approach as of 2024-2025. However, the documentation emphasizes:

> "Never manage references to views in your plugin. Obsidian may call the view factory function multiple times."

### Issues Found
1. **Manual leaf tracking**: Lines 36, 124, 231-234 manually track leaves in an array
2. **Manual leaf cleanup**: Lines 90-96 manually detach leaves in `onunload`

### Recommended Pattern
```typescript
// Instead of maintaining a leaves array, use getLeavesOfType():
async onunload() {
    // No need to manually detach - Obsidian handles this automatically
    // Only if you need to clean up custom state:
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);
    leaves.forEach(leaf => {
        if (leaf.view instanceof CurrentFolderNotesDisplayView) {
            // Call any custom cleanup on your view
            leaf.view.cleanup();
        }
    });
}
```

---

## 2. Event Handling Best Practices

### Current State
Uses manual debouncing with `NodeJS.Timeout`:
```typescript
let refreshTimeout: NodeJS.Timeout | null = null;
const debouncedRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        this.refreshView();
    }, 300);
};
```

### New Recommendation: Use Obsidian's `debounce` Function

As of API 1.4.4+, Obsidian provides a built-in `debounce` function with a `Debouncer` interface:

```typescript
import { debounce, Debouncer } from 'obsidian';

export default class CurrentFolderNotesDisplay extends Plugin {
    private debouncedRefresh: Debouncer<[], void>;

    async onload() {
        // Use Obsidian's built-in debounce
        this.debouncedRefresh = debounce(() => {
            this.refreshView();
        }, 300, true); // true = reset timer on each call

        this.registerEvent(this.app.workspace.on('file-open', () => this.debouncedRefresh()));
        this.registerEvent(this.app.vault.on('delete', () => this.debouncedRefresh()));
        this.registerEvent(this.app.vault.on('create', () => this.debouncedRefresh()));
        this.registerEvent(this.app.vault.on('rename', () => this.debouncedRefresh()));
    }

    onunload() {
        // Cancel any pending debounced calls
        this.debouncedRefresh?.cancel();
    }
}
```

### Benefits
- Type-safe with proper TypeScript generics
- Built-in `cancel()` and `run()` methods
- Automatic cleanup when plugin unloads (via registerEvent)
- No NodeJS.Timeout typing issues

---

## 3. Performance Optimizations

### Current State
The plugin already implements several good practices:
- Content size limits (line 242: `MAX_CONTENT_SIZE = 500000`)
- Heading count limits (line 257: `MAX_HEADINGS = 100`)
- File display limits via settings (line 533: `maxFilesDisplay`)
- Batch processing (lines 538-590)

### New Recommendations

#### Use `requestIdleCallback` for Non-Critical Updates
```typescript
// Instead of setTimeout for batch processing
const processBatch = (startIdx: number) => {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            // Process batch during idle time
            this.processBatchInternal(startIdx);
        }, { timeout: 50 });
    } else {
        setTimeout(() => this.processBatchInternal(startIdx), 50);
    }
};
```

#### Virtual Scrolling for Large Lists
For folders with many files, consider implementing virtual scrolling:
```typescript
// Render only visible items
const VISIBLE_ITEMS = 20;
const ITEM_HEIGHT = 30;

private renderVisibleItems(scrollTop: number) {
    const startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
    const endIndex = startIndex + VISIBLE_ITEMS;
    const visibleFiles = this.files.slice(startIndex, endIndex);
    // Render only visibleFiles
}
```

#### Use `MetadataCache` for Headings Instead of Parsing
Instead of regex-parsing file content for headings (line 254), use the cached metadata:

```typescript
// More efficient - uses pre-parsed cache
const cache = this.app.metadataCache.getFileCache(file);
if (cache?.headings) {
    for (const heading of cache.headings) {
        // Process heading from cache
    }
}
```

---

## 4. Mobile/Desktop Compatibility

### Critical Issue Found
Line 599 uses internal API access:
```typescript
(this.app as any).isMobile
```

### New Public API: `Platform`

As of recent API versions, Obsidian provides a public `Platform` constant:

```typescript
import { Platform } from 'obsidian';

// Replace (this.app as any).isMobile with:
if (Platform.isMobile) {
    // Mobile-specific logic
}

// Platform provides:
Platform.isDesktop      // boolean - UI in desktop mode
Platform.isMobile       // boolean - UI in mobile mode
Platform.isDesktopApp   // boolean - electron desktop app
Platform.isMobileApp    // boolean - capacitor mobile app
Platform.isIosApp       // boolean - iOS app
Platform.isAndroidApp   // boolean - Android app
```

### Recommended Update
```typescript
// Line 599 should become:
const shouldApplyBiggerText = this.plugin.settings.biggerText &&
    (!this.plugin.settings.biggerTextMobileOnly || Platform.isMobile);
```

---

## 5. View Registration Patterns

### Current State
The view registration pattern is correct and up-to-date:
```typescript
this.registerView(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, (leaf) => 
    new CurrentFolderNotesDisplayView(leaf, this)
);
```

### New Lifecycle Hooks
Consider implementing additional hooks for better state management:

```typescript
export class CurrentFolderNotesDisplayView extends ItemView {
    // Add state persistence
    getState(): any {
        return {
            // Save view state
            scrollPosition: this.containerEl.scrollTop,
            filterText: this.currentFilter
        };
    }

    setState(state: any, result: ViewStateResult): Promise<void> {
        // Restore view state
        if (state.scrollPosition) {
            this.containerEl.scrollTop = state.scrollPosition;
        }
        return super.setState(state, result);
    }

    // New in recent versions - called when view size changes
    onResize(): void {
        // Handle resize if needed
    }
}
```

---

## 6. Memory Management

### Current State
Good practices already in place:
- Uses `registerEvent` for automatic cleanup (lines 80-83)
- Uses `register(() => styleEl.remove())` (line 184)
- Manual event listener removal in `onClose` (lines 231-234)

### New Recommendations

#### Use `registerDomEvent` for DOM Event Listeners
Instead of manual `addEventListener`:
```typescript
// Instead of:
a.addEventListener('click', () => { ... });

// Use (if you need automatic cleanup):
this.registerDomEvent(a, 'click', () => { ... });
```

#### Cleanup Pattern for Custom Event Listeners
```typescript
export class CurrentFolderNotesDisplayView extends ItemView {
    private eventCallbacks: (() => void)[] = [];

    createFileLink(container: HTMLElement, file: TFile) {
        const link = container.createEl('a', { text: file.basename });
        
        // Store callback for cleanup
        const clickHandler = () => this.openFile(file);
        link.addEventListener('click', clickHandler);
        
        // Track for cleanup
        this.eventCallbacks.push(() => {
            link.removeEventListener('click', clickHandler);
        });
    }

    async onClose() {
        // Clean up all custom event listeners
        this.eventCallbacks.forEach(cleanup => cleanup());
        this.eventCallbacks = [];
        
        // Parent cleanup
        return super.onClose();
    }
}
```

---

## 7. TypeScript Type Improvements

### Current Issues
1. **Line 71**: Uses `NodeJS.Timeout` type (should use `Debouncer`)
2. **Line 599**: Uses `as any` cast for `isMobile` (should use `Platform`)
3. **Line 411**: Uses `any` type: `folder.children.filter((file: any) => ...)`

### Recommended Types

```typescript
import { 
    App, 
    Plugin, 
    TFile, 
    TFolder, 
    TAbstractFile,
    WorkspaceLeaf, 
    ItemView,
    Platform,
    debounce,
    Debouncer,
    MetadataCache
} from 'obsidian';

// For file filtering
folder.children.filter((file: TAbstractFile): file is TFile => 
    file instanceof TFile
);

// For debouncing
private debouncedRefresh: Debouncer<[], void>;
```

---

## 8. Settings Persistence

### Current State
Uses standard `loadData`/`saveData`:
```typescript
async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

async saveSettings() {
    await this.saveData(this.settings);
}
```

### New API Features (v1.13.0+)

The Plugin class now has a `settings` property:
```typescript
export default class CurrentFolderNotesDisplay extends Plugin {
    // Declare typed settings
    settings: CurrentFolderNotesDisplaySettings;

    async onload() {
        // New built-in settings loading
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
}
```

### Settings Definition API (v1.13.0+)
New in v1.13.0: `getSettingDefinitions()` for better settings introspection:

```typescript
class CurrentFolderNotesDisplaySettingTab extends PluginSettingTab {
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                key: 'maxFilesDisplay',
                type: 'number',
                min: 10,
                max: 500,
                description: 'Maximum files to display'
            }
        ];
    }
}
```

---

## 9. Deprecated Patterns to Update

| Pattern | Status | Replacement |
|---------|--------|-------------|
| `(this.app as any).isMobile` | ❌ Internal API | `Platform.isMobile` |
| `setWarning()` on ButtonComponent | ⚠️ Deprecated (v0.11.0) | `setDestructive()` |
| `iterateCacheRefs` | ⚠️ Deprecated | Iterate manually over `cache.links`, `cache.embeds` |
| Manual `NodeJS.Timeout` for debouncing | ❌ Not recommended | `debounce()` function |
| Manual leaf management | ⚠️ Discouraged | Use `getLeavesOfType()` |

---

## 10. Code Examples: Modern Patterns

### Before vs After

#### Mobile Detection
```typescript
// Before (line 599)
(this.app as any).isMobile

// After
import { Platform } from 'obsidian';
Platform.isMobile
```

#### Debouncing
```typescript
// Before (lines 70-77)
let refreshTimeout: NodeJS.Timeout | null = null;
const debouncedRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        this.refreshView();
    }, 300);
};

// After
import { debounce } from 'obsidian';
private debouncedRefresh = debounce(() => {
    this.refreshView();
}, 300, true);
```

#### File Type Filtering
```typescript
// Before (line 411)
files = folder.children.filter((file: any) => file instanceof TFile) as TFile[];

// After
files = folder.children.filter((file): file is TFile => 
    file instanceof TFile
);
```

#### Heading Extraction
```typescript
// Before (lines 254-317) - Regex parsing
const headingRegex = /^(#+)\s+(.*)$/gm;

// After - Use cached metadata
const cache = this.app.metadataCache.getFileCache(file);
if (cache?.headings) {
    for (const heading of cache.headings) {
        // heading.level, heading.heading, heading.position
    }
}
```

---

## 11. Performance Optimization Opportunities

### High Priority
1. **Use MetadataCache for headings** - Avoids re-parsing file content
2. **Implement virtual scrolling** - For folders with 100+ files
3. **Use `requestIdleCallback`** - For non-critical background tasks

### Medium Priority
1. **Lazy load outlines** - Already partially implemented (line 508)
2. **Debounce file system events** - Currently uses 300ms, could use 100ms for better responsiveness
3. **Cache folder contents** - Cache filtered/sorted results until file events fire

### Low Priority
1. **Batch DOM updates** - Use DocumentFragment for large list updates
2. **Passive event listeners** - For scroll events if implementing virtual scrolling

---

## 12. Summary of Recommended Changes

### Critical (Breaking Risk)
- [ ] Replace `(this.app as any).isMobile` with `Platform.isMobile`
- [ ] Replace manual `NodeJS.Timeout` debouncing with `debounce()` function

### Important (Best Practices)
- [ ] Use `TAbstractFile` instead of `any` for file filtering
- [ ] Remove manual leaf tracking (lines 36, 124, 231-234)
- [ ] Use `MetadataCache` instead of regex for headings
- [ ] Add proper TypeScript types to all callbacks

### Enhancement (Performance)
- [ ] Implement virtual scrolling for large folders
- [ ] Use `requestIdleCallback` for batch processing
- [ ] Cache parsed results until file events fire

### Minor (Code Quality)
- [ ] Update deprecated `setWarning()` to `setDestructive()` if used
- [ ] Replace manual event listener cleanup with `registerDomEvent` where appropriate
- [ ] Add `getState`/`setState` for view persistence

---

## References

1. [Obsidian Developer Documentation](https://docs.obsidian.md/)
2. [Obsidian API TypeScript Definitions](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)
3. [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
4. [Views Documentation](https://docs.obsidian.md/Plugins/User+interface/Views)
5. [Events Documentation](https://docs.obsidian.md/Plugins/Events)

---

*Report generated: 2024-2025*
*API Version: 1.13.0+*

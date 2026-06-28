# Current Folder Notes Plugin - Optimization Analysis Report

**Date:** June 21, 2026  
**Plugin Version:** 1.7.15  
**minAppVersion:** 1.7.7  
**Target:** Update to modern Obsidian API patterns

---

## Executive Summary

Analysis of the Current Folder Notes plugin reveals several opportunities to modernize the code using the latest Obsidian API (v1.13.1). The plugin uses deprecated patterns that should be replaced for better compatibility, performance, and maintainability.

---

## Critical Issues Found

### 1. Mobile Detection (HIGH PRIORITY)

**Current Code (Line 608):**
```typescript
const shouldApplyBiggerText = this.plugin.settings.biggerText &&
    (!this.plugin.settings.biggerTextMobileOnly || (this.app as any).isMobile);
```

**Problem:** Accessing `this.app.isMobile` via `(this.app as any)` is using an internal/undocumented API. This is brittle and may break in future Obsidian versions.

**Solution:** Use the official `Platform` API:

```typescript
// Import at the top of the file
import { Platform } from "obsidian";

// Replace the check with:
const shouldApplyBiggerText = this.plugin.settings.biggerText &&
    (!this.plugin.settings.biggerTextMobileOnly || Platform.isMobile);
```

**Why this is better:**
- Official public API since Obsidian v0.12.2
- Type-safe (no `as any` casting needed)
- Provides multiple useful properties: `isMobile`, `isMobileApp`, `isPhone`, `isTablet`, `isDesktopApp`, `isIosApp`, `isAndroidApp`, etc.
- Won't break with API updates

---

### 2. View Lifecycle - Leaves Array Tracking (MEDIUM PRIORITY)

**Current Code:**
```typescript
// Line 38
public leaves: WorkspaceLeaf[] = [];

// Line 231-236 (onClose)
const index = this.plugin.leaves.indexOf(this.leaf);
if (index > -1) {
    this.plugin.leaves.splice(index, 1);
}
```

**Problem:** The plugin manually tracks leaves in an array, but Obsidian's Workspace API already provides `getLeavesOfType()` which returns live leaves. This manual tracking is redundant and can lead to memory leaks if not properly cleaned up.

**Solution:** Remove the `leaves` array entirely and rely on `workspace.getLeavesOfType()`:

```typescript
// Remove: public leaves: WorkspaceLeaf[] = [];

// In activateView, remove: this.leaves.push(leaf);

// In onClose, remove the entire manual cleanup block:
// const index = this.plugin.leaves.indexOf(this.leaf);
// if (index > -1) {
//     this.plugin.leaves.splice(index, 1);
// }
```

**Why this is better:**
- Uses Obsidian's built-in leaf management
- Eliminates potential memory leaks from stale references
- Reduces code complexity
- More reliable - Obsidian handles the lifecycle

---

### 3. Event Handling - NodeJS.Timeout Type (MEDIUM PRIORITY)

**Current Code (Line 73):**
```typescript
let refreshTimeout: NodeJS.Timeout | null = null;
```

**Problem:** Using `NodeJS.Timeout` assumes a Node.js environment, but Obsidian plugins run in Electron (desktop) or Capacitor (mobile) which may have different timer types. This can cause type errors in some environments.

**Solution:** Use `ReturnType<typeof setTimeout>`:

```typescript
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
```

Or use Obsidian's built-in `debounce` helper:

```typescript
// Import at the top
import { debounce } from "obsidian";

// Replace manual debouncing (lines 72-85) with:
const debouncedRefresh = debounce(() => {
    this.refreshView();
}, 300, false); // false = don't reset timer on repeated calls

// Then use it directly:
this.registerEvent(this.app.workspace.on('file-open', debouncedRefresh));
this.registerEvent(this.app.vault.on('delete', debouncedRefresh));
this.registerEvent(this.app.vault.on('create', debouncedRefresh));
this.registerEvent(this.app.vault.on('rename', debouncedRefresh));

// The debouncer is automatically cleaned up when plugin unloads
```

**Why this is better:**
- `debounce` is a public API since v0.15.0
- Type-safe across all platforms
- Automatically handles cleanup
- More readable and maintainable
- Follows Obsidian best practices

---

### 4. File Reading - vault.read() vs cachedRead() (HIGH PRIORITY)

**Current Code (Lines 518, 571, 683):**
```typescript
const fileContent = await this.app.vault.read(currentFile);
const fileContent = await this.app.vault.read(file);
const fileContent = await this.app.vault.read(activeFile);
```

**Problem:** Using `vault.read()` bypasses the cache and reads directly from disk every time. For frequently accessed files (like when refreshing the view), this is inefficient.

**Solution:** Use `vault.cachedRead()` for better performance:

```typescript
// For reading file content when it may have been read before:
const fileContent = await this.app.vault.cachedRead(file);
```

**When to use each:**
- `vault.cachedRead(file)` - When reading files that may be cached (most UI reads)
- `vault.read(path)` - When you absolutely need fresh content from disk

**Why this is better:**
- `cachedRead` uses Obsidian's internal cache
- Significantly faster for repeated reads
- Reduces I/O operations
- Better battery life on mobile

---

### 5. Import Consolidation (LOW PRIORITY)

**Current Code (Lines 1-4):**
```typescript
import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { ItemView, WorkspaceLeaf } from "obsidian";
import { MarkdownView } from "obsidian";
import { TFolder } from "obsidian";
```

**Problem:** Multiple import statements from the same module.

**Solution:** Consolidate imports:

```typescript
import { 
    App, 
    Notice, 
    Plugin, 
    PluginSettingTab, 
    Setting, 
    TFile,
    ItemView, 
    WorkspaceLeaf,
    MarkdownView,
    TFolder,
    Platform,
    debounce
} from 'obsidian';
```

---

### 6. TypeScript Configuration Updates (MEDIUM PRIORITY)

**Current tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES6",
    "lib": ["DOM", "ES5", "ES6", "ES7"],
    ...
  }
}
```

**Recommended Updates:**
```json
{
  "compilerOptions": {
    "target": "ES2018",
    "lib": ["DOM", "DOM.Iterable", "ES2018"],
    "module": "ESNext",
    "moduleResolution": "node",
    "inlineSourceMap": true,
    "inlineSources": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Why this is better:**
- ES2018 is widely supported and provides useful features
- `strict: true` catches more potential bugs
- Modern lib definitions are more complete

---

### 7. Performance: Batch Processing Improvements (LOW PRIORITY)

**Current Code (Lines 547-599):**
The batch processing is already well-implemented, but consider using `requestAnimationFrame` for UI updates instead of `setTimeout` for better synchronization with the browser's render cycle.

**Potential Enhancement:**
```typescript
// Instead of setTimeout(() => processBatch(endIdx), 50);
// Use requestAnimationFrame for UI batching:
const processBatch = (startIdx: number) => {
    // ... process batch
    if (endIdx < displayedFiles.length) {
        requestAnimationFrame(() => processBatch(endIdx));
    }
};
```

**Note:** This is optional - the current implementation is acceptable.

---

### 8. Event Listener Cleanup (MEDIUM PRIORITY)

**Current Code (Lines 280-301):**
```typescript
p.addEventListener('click', (event) => { ... });
p.onmouseover = () => { ... };
p.onmouseout = () => { ... };
```

**Problem:** Event listeners added with `addEventListener` and `onmouseover/out` properties are not automatically cleaned up when the view is destroyed.

**Solution:** Use Obsidian's event registration system or manually track and clean up:

```typescript
// In the view class, add an array to track listeners:
private eventRefs: (() => void)[] = [];

// When adding listeners:
const clickHandler = (event: MouseEvent) => { ... };
p.addEventListener('click', clickHandler);
this.eventRefs.push(() => p.removeEventListener('click', clickHandler));

// In onClose:
async onClose() {
    this.eventRefs.forEach(cleanup => cleanup());
    this.eventRefs = [];
}
```

**Better Alternative:** Use Obsidian's `registerDomEvent`:

```typescript
// Instead of manual event listener attachment:
this.registerDomEvent(p, 'click', (event: MouseEvent) => {
    // handler
});
```

**Why this is better:**
- Automatically cleaned up when view is destroyed
- Follows Obsidian patterns
- Prevents memory leaks

---

## Summary of Required Changes

### Must-Have (High Priority)
1. **Replace `(this.app as any).isMobile`** with `Platform.isMobile`
2. **Add `Platform` and `debounce` to imports**
3. **Replace `NodeJS.Timeout`** with `ReturnType<typeof setTimeout>` or use `debounce()`
4. **Use `vault.cachedRead()`** instead of `vault.read()` where appropriate

### Should-Have (Medium Priority)
5. **Remove `leaves` array tracking** - rely on `getLeavesOfType()`
6. **Update TypeScript configuration** for ES2018 and strict mode
7. **Use `registerDomEvent`** for automatic cleanup

### Nice-to-Have (Low Priority)
8. **Consolidate import statements**
9. **Consider `requestAnimationFrame`** for batch processing
10. **Update obsidian package** to latest version

---

## Modernized Code Example

Here's how key sections should look after optimization:

```typescript
import { 
    App, 
    Notice, 
    Plugin, 
    PluginSettingTab, 
    Setting, 
    TFile,
    ItemView, 
    WorkspaceLeaf,
    MarkdownView,
    TFolder,
    Platform,      // NEW: Import Platform
    debounce       // NEW: Import debounce
} from 'obsidian';

export default class CurrentFolderNotesDisplay extends Plugin {
    settings: CurrentFolderNotesDisplaySettings;
    // REMOVE: public leaves: WorkspaceLeaf[] = [];

    async onload() {
        await this.loadSettings();
        this.loadStyles();
        this.addSettingTab(new CurrentFolderNotesDisplaySettingTab(this.app, this));
        
        this.registerView(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, (leaf) => 
            new CurrentFolderNotesDisplayView(leaf, this));

        this.addRibbonIcon('folder', 'Activate folder notes display', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'activate-folder-notes-display',
            name: 'Open Pane',
            callback: () => this.activateView()
        });

        // MODERN: Use Obsidian's debounce
        const debouncedRefresh = debounce(() => {
            this.refreshView();
        }, 300, false);

        this.registerEvent(this.app.workspace.on('file-open', debouncedRefresh));
        this.registerEvent(this.app.vault.on('delete', debouncedRefresh));
        this.registerEvent(this.app.vault.on('create', debouncedRefresh));
        this.registerEvent(this.app.vault.on('rename', debouncedRefresh));
    }

    async activateView() {
        const { workspace } = this.app;
        const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);

        if (existingLeaves.length > 1) {
            for (let i = 1; i < existingLeaves.length; i++) {
                existingLeaves[i].detach();
            }
        }

        let leaf: WorkspaceLeaf | null = null;

        if (existingLeaves.length) {
            leaf = existingLeaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ 
                    type: VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, 
                    active: true 
                });
                // REMOVE: this.leaves.push(leaf);
            }
        }

        if (!leaf) {
            new Notice('Could not create a new leaf for the view');
            return;
        }
        workspace.revealLeaf(leaf);
    }
}

export class CurrentFolderNotesDisplayView extends ItemView {
    plugin: CurrentFolderNotesDisplay;
    private eventRefs: (() => void)[] = []; // Track event listeners

    constructor(leaf: WorkspaceLeaf, plugin: CurrentFolderNotesDisplay) {
        super(leaf);
        this.plugin = plugin;
    }

    // ... other methods ...

    async onClose() {
        // Clean up event listeners
        this.eventRefs.forEach(cleanup => cleanup());
        this.eventRefs = [];
        // REMOVE: Manual leaves array cleanup
    }

    createClickableHeadings(container: HTMLElement, currentFileContent: string, 
                           currentFilePath: string, addExtraHeadingCSS: boolean): void {
        // ... existing code ...
        
        // MODERN: Use cachedRead for file reading
        // In displayNotesInCurrentFolder():
        // const fileContent = await this.app.vault.cachedRead(currentFile);
    }

    async displayNotesInCurrentFolder(): Promise<void> {
        // ... existing code ...

        // Line 608 - MODERN mobile detection:
        const shouldApplyBiggerText = this.plugin.settings.biggerText &&
            (!this.plugin.settings.biggerTextMobileOnly || Platform.isMobile);
        
        // Line 518 - MODERN file reading:
        // const fileContent = await this.app.vault.cachedRead(currentFile);
        
        // ... rest of existing code ...
    }
}
```

---

## Testing Recommendations

After implementing these changes:

1. **Test mobile detection** by opening Obsidian on mobile and checking if "bigger text" applies correctly
2. **Test view lifecycle** by opening/closing the panel multiple times and checking for memory leaks
3. **Test file reading** to ensure content loads correctly with `cachedRead`
4. **Test debouncing** by rapidly switching files to ensure updates are throttled properly

---

## References

- [Obsidian API Documentation](https://github.com/obsidianmd/obsidian-api)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- Platform API added in: v0.12.2
- debounce() added in: v0.15.0
- cachedRead() available since: v0.10.0

---

*Report generated by AI analysis of plugin source code against latest Obsidian API definitions.*

# Current Folder Notes Plugin - Optimization Summary

**Quick reference for implementing critical fixes**

---

## Critical Fixes (Apply These First)

### 1. Mobile Detection API

**File:** `main.ts`, Line 608

**Before:**
```typescript
const shouldApplyBiggerText = this.plugin.settings.biggerText &&
    (!this.plugin.settings.biggerTextMobileOnly || (this.app as any).isMobile);
```

**After:**
```typescript
import { Platform } from 'obsidian';

const shouldApplyBiggerText = this.plugin.settings.biggerText &&
    (!this.plugin.settings.biggerTextMobileOnly || Platform.isMobile);
```

**Why:** `(this.app as any).isMobile` accesses internal API. `Platform.isMobile` is official since v0.12.2.

---

### 2. File Reading Performance

**Files:** `main.ts`, Lines 518, 571, 683

**Before:**
```typescript
const fileContent = await this.app.vault.read(currentFile);
const fileContent = await this.app.vault.read(file);
const fileContent = await this.app.vault.read(activeFile);
```

**After:**
```typescript
const fileContent = await this.app.vault.cachedRead(currentFile);
const fileContent = await this.app.vault.cachedRead(file);
const fileContent = await this.app.vault.cachedRead(activeFile);
```

**Why:** `cachedRead()` uses Obsidian's internal cache, significantly faster for repeated reads.

---

### 3. Debounce Implementation

**File:** `main.ts`, Lines 72-85

**Before:**
```typescript
let refreshTimeout: NodeJS.Timeout | null = null;
const debouncedRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        this.refreshView();
    }, 300);
};
```

**After:**
```typescript
import { debounce } from 'obsidian';

const debouncedRefresh = debounce(() => {
    this.refreshView();
}, 300, false);
```

**Why:** Obsidian's `debounce()` is type-safe, cross-platform, and automatically cleaned up.

---

### 4. Import Consolidation

**File:** `main.ts`, Lines 1-4

**Before:**
```typescript
import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { ItemView, WorkspaceLeaf } from "obsidian";
import { MarkdownView } from "obsidian";
import { TFolder } from "obsidian";
```

**After:**
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

## Medium Priority Fixes

### 5. Remove Manual Leaves Tracking

**File:** `main.ts`, Lines 38, 126, 231-236

**Remove Line 38:**
```typescript
// DELETE: public leaves: WorkspaceLeaf[] = [];
```

**Remove Line 126:**
```typescript
// DELETE: this.leaves.push(leaf);
```

**Remove Lines 231-236 (onClose method):**
```typescript
// DELETE entire onClose cleanup:
// const index = this.plugin.leaves.indexOf(this.leaf);
// if (index > -1) {
//     this.plugin.leaves.splice(index, 1);
// }
```

**Why:** `workspace.getLeavesOfType()` already handles this. Manual tracking causes memory leaks.

---

### 6. TypeScript Configuration

**File:** `tsconfig.json`

**Before:**
```json
{
  "compilerOptions": {
    "target": "ES6",
    "lib": ["DOM", "ES5", "ES6", "ES7"],
    ...
  }
}
```

**After:**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2018",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["DOM", "DOM.Iterable", "ES2018"]
  },
  "include": ["**/*.ts"]
}
```

---

### 7. Event Listener Cleanup (Optional Enhancement)

**File:** `main.ts`, Various lines

**Current:**
```typescript
p.addEventListener('click', (event) => { ... });
p.onmouseover = () => { ... };
p.onmouseout = () => { ... };
```

**Better:**
```typescript
this.registerDomEvent(p, 'click', (event: MouseEvent) => { ... });
this.registerDomEvent(p, 'mouseover', () => { ... });
this.registerDomEvent(p, 'mouseout', () => { ... });
```

**Why:** `registerDomEvent` automatically cleans up when the view is destroyed.

---

## Complete Modernized Section

Here's the fully optimized `onload()` method:

```typescript
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

    // Modern debounce using Obsidian's helper
    const debouncedRefresh = debounce(() => {
        this.refreshView();
    }, 300, false);

    this.registerEvent(this.app.workspace.on('file-open', debouncedRefresh));
    this.registerEvent(this.app.vault.on('delete', debouncedRefresh));
    this.registerEvent(this.app.vault.on('create', debouncedRefresh));
    this.registerEvent(this.app.vault.on('rename', debouncedRefresh));
}
```

---

## Testing Checklist

After implementing:

- [ ] Open plugin on mobile - verify "bigger text" works
- [ ] Switch between files rapidly - verify debounce throttles updates
- [ ] Open/close panel multiple times - check for memory leaks
- [ ] Test with large folders - verify cachedRead performance
- [ ] Run TypeScript compiler - check for type errors

---

*See full analysis: `/Users/caffae/Notes/TestPlugin/.obsidian/plugins/Current Folder Notes /research/optimization-analysis.md`*

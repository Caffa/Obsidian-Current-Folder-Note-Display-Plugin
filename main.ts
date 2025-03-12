import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { ItemView, WorkspaceLeaf } from "obsidian";
import { MarkdownView } from "obsidian";
import { TFolder } from "obsidian";

interface CurrentFolderNotesDisplaySettings {
	excludeTitlesFilter: string;
	includeTitleFilter: string;
	prettyTitleCase: boolean;
	includeSubfolderNotes: boolean;
	includeCurrentFileOutline: boolean;
	includeListFileOutlines: boolean;
	styleMode: 'minimal' | 'fancy' | 'neobrutalist';
	showNavigation: boolean;
	biggerText: boolean; // Add this line
	biggerTextMobileOnly: boolean; // Add this new setting
}

const DEFAULT_SETTINGS: Partial<CurrentFolderNotesDisplaySettings> = {
	excludeTitlesFilter: '_index',
	includeTitleFilter: '',
	prettyTitleCase: true,
	includeSubfolderNotes: false,
	includeCurrentFileOutline: true,
	includeListFileOutlines: false,
	styleMode: 'fancy',
	showNavigation: false,
	biggerText: false,
	biggerTextMobileOnly: false // Add default value
}

export default class CurrentFolderNotesDisplay extends Plugin {
	settings: CurrentFolderNotesDisplaySettings;
	public leaves: WorkspaceLeaf[] = [];

	fileChangeHandler(file: TFile) {
		if (file instanceof TFile) {
			this.load();
		}
	}

	async onload() {
		await this.loadSettings();

		 // Load custom styles
		this.loadStyles();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CurrentFolderNotesDisplaySettingTab(this.app, this));

		// add a panel to the right sidebar - view
		this.registerView(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, (leaf) => new CurrentFolderNotesDisplayView(leaf, this));

		// Add a ribbon icon
		this.addRibbonIcon('folder', 'Activate folder notes display', () => {
			this.activateView();
		});

		// Add a command to open the view
		this.addCommand({
			id: 'activate-folder-notes-display',
			name: 'Open Pane',
			callback: () => {
				this.activateView();
			}
		});

		 // Add debouncing for refreshView
		let refreshTimeout: NodeJS.Timeout | null = null;
		const debouncedRefresh = () => {
			if (refreshTimeout) clearTimeout(refreshTimeout);
			refreshTimeout = setTimeout(() => {
				this.refreshView();
			}, 300); // Wait 300ms before refreshing
		};

		// Use debounced refresh for all file events
		this.registerEvent(this.app.workspace.on('file-open', debouncedRefresh));
		this.registerEvent(this.app.vault.on('delete', debouncedRefresh));
		this.registerEvent(this.app.vault.on('create', debouncedRefresh));
		this.registerEvent(this.app.vault.on('rename', debouncedRefresh));
	}

	async onunload() {
		console.log('unloading plugin');

		// Clean up by detaching any leaves created by this plugin
		const leavesToDetach = this.app.workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);
		leavesToDetach.forEach(leaf => {
			leaf.detach();
		});

		// Clear the leaves array
		this.leaves = [];
	}

	async activateView() {
		const { workspace } = this.app;

		// Clean up existing leaves first to prevent duplicates
		const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);

		// Keep only the first leaf if multiple exist
		if (existingLeaves.length > 1) {
			for (let i = 1; i < existingLeaves.length; i++) {
				existingLeaves[i].detach();
			}
		}

		let leaf: WorkspaceLeaf | null = null;

		if (existingLeaves.length) {
			// A leaf with our view already exists, use that
			leaf = existingLeaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, active: true });
				// Only add to leaves array if it's a new leaf
				this.leaves.push(leaf);
			}
		}

		if (!leaf) {
			new Notice('Could not create a new leaf for the view');
			return;
		}
		workspace.revealLeaf(leaf);
	}

	async refreshView() {
		const { workspace } = this.app;
		// console.log("[CFN] Refresh view triggered");
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);
		// console.log("[CFN] Found leaves:", leaves.length);

		if (leaves.length > 1) {
			// console.log("[CFN] Multiple leaves found, cleaning up extras");
			for (let i = 1; i < leaves.length; i++) {
				leaves[i].detach();
			}
		}

		if (leaves.length === 1) {
			// console.log("[CFN] Updating existing view");
			const view = leaves[0].view as CurrentFolderNotesDisplayView;
			await view.displayNotesInCurrentFolder();
		} else if (leaves.length === 0) {
			// console.log("[CFN] No view found, creating new one");
			this.activateView();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Add this method to load styles
	loadStyles() {
		// Load styles from the plugin's styles.css
		const styleEl = document.createElement('style');
		styleEl.id = 'current-folder-notes-styles';
		document.head.appendChild(styleEl);

		// Register the stylesheet to be removed when the plugin unloads
		this.register(() => styleEl.remove());

		// Load the CSS file from the plugin directory
		this.loadData().then(data => {
			// You can add default styles here if needed
			const defaultStyles = `
				.folder-notes-style { font-weight: 500; }
				.folder-notes-style.current-file { font-weight: bold; }
				.hover-style-file { text-decoration: underline; }
				.hover-style-heading { font-style: italic; }
				/* Add more default styles as needed */
			`;
			styleEl.textContent = defaultStyles;
		});
	}
}

export const VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY = "current-folder-notes-view";

export class CurrentFolderNotesDisplayView extends ItemView {
	plugin: CurrentFolderNotesDisplay;

	constructor(leaf: WorkspaceLeaf, plugin: CurrentFolderNotesDisplay) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY;
	}

	getDisplayText() {
		return "Current Folder Notes";
	}

	getIcon(): string {
		return 'folder';

	}

	async onOpen() {

		await this.displayNotesInCurrentFolder();
	}

	async onClose() {
			// Remove this leaf from the plugin's leaves array to avoid memory leaks
			const index = this.plugin.leaves.indexOf(this.leaf);
			if (index > -1) {
				this.plugin.leaves.splice(index, 1);
			}
		}

	// main.ts

	// Function to create clickable headings
	createClickableHeadings(container: HTMLElement, currentFileContent: string, currentFilePath: string, addExtraHeadingCSS: boolean): void {
		// Set a maximum limit on the file content to process for safety
		const MAX_CONTENT_SIZE = 500000; // 500KB max processing size

		if (currentFileContent.length > MAX_CONTENT_SIZE) {
			currentFileContent = currentFileContent.substring(0, MAX_CONTENT_SIZE);
			// Add a note that content was truncated
			container.createEl('p', {
				cls: 'content-truncated-note',
				text: 'Note is very large. Only showing headings from the first portion.'
			});
		}

		// Use a more efficient regex approach for large files
		const headingRegex = /^(#+)\s+(.*)$/gm;
		let match;
		let headingCount = 0;
		const MAX_HEADINGS = 100; // Limit the number of headings displayed

		// Process headings in batches for very large files
		try {
			while ((match = headingRegex.exec(currentFileContent)) !== null && headingCount < MAX_HEADINGS) {
				const headingLevel = match[1].length;
				let headingText = match[2];

				// Use extractAlias to get the alias from the heading text
				headingText = this.extractAlias(headingText);
				// Add a right arrow symbol to the heading text
				let headingLabel = '→ ' + headingText;

				const p: HTMLElement = container.createEl('p', { text: headingLabel });
				p.classList.add('basic-heading');
				p.classList.add(`heading-level-${headingLevel}`);

				if (addExtraHeadingCSS) {
					p.classList.add('extra-heading-style');
				}

				p.addEventListener('click', (event) => {
					// Prevent default behavior
					event.preventDefault();

					// Use the openLinkText method to navigate to the heading
					this.app.workspace.openLinkText('#' + headingText, currentFilePath);

					// Clear any text selection
					const selection = window.getSelection();
					if (selection) {
						selection.removeAllRanges();
					}
				});

				// Add hover effect
				p.onmouseover = () => {
					p.classList.add('hover-style-heading');
				}
				// Remove hover effect when not hovering
				p.onmouseout = () => {
					p.classList.remove('hover-style-heading');
				}

				headingCount++;
			}

			// Indicate if there are more headings not shown
			if (headingCount >= MAX_HEADINGS) {
				container.createEl('p', {
					cls: 'more-headings-note',
					text: '... more headings available (not shown)'
				});
			}
		} catch (err) {
			console.error("Error processing headings:", err);
			container.createEl('p', {
				cls: 'error-note',
				text: 'Error processing headings'
			});
		}
	}

	// Function to extract alias from heading text
	extractAlias(headingText: string): string {
		const matches = headingText.match(/\[\[.*\|(.*?)\]\]/);
		return matches ? matches[1] : headingText;
	}

	private getShortNoteName(basename: string): string {
		// Try to find T numbers first (e.g., T1, T23)
		const tMatch = basename.match(/T(\d+)/);
		if (tMatch) return `T${tMatch[1]}`;

		// Try to find Y numbers next (e.g., Y1, Y2023)
		const yMatch = basename.match(/Y(\d+)/);
		if (yMatch) return `Y${yMatch[1]}`;

		// Try to find any numbers
		const numberMatch = basename.match(/\d+/);
		if (numberMatch) return numberMatch[0];

		// Try to find text after dash
		const dashMatch = basename.match(/-\s*(.+)$/);
		if (dashMatch) return dashMatch[1];

		// If nothing else matches, return the basename
		return basename;
	}

	async displayNotesInCurrentFolder(): Promise<void> {
		// console.log("[CFN] Starting displayNotesInCurrentFolder");
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// Get display settings
		// const displayMode = this.plugin.settings.displayMode; // Removed
		const styleMode = this.plugin.settings.styleMode;
		const showNavigation = this.plugin.settings.showNavigation;

		// Create header
		const headerContainer = container.createDiv({ cls: 'folder-view-header' });
		headerContainer.createEl("h6", { text: "Current Folder Notes" });

		// Get current file info and folder path
		const activeFile = this.app.workspace.getActiveFile();
		// console.log("[CFN] Active file:", activeFile?.path);

		const currentFilePath = activeFile ? activeFile.path : '';
		let parentFolderPath = '';  // Don't default to root

		if (currentFilePath) {
			const lastSlashIndex = currentFilePath.lastIndexOf('/');
			parentFolderPath = lastSlashIndex > 0 ? currentFilePath.substring(0, lastSlashIndex) : '';
			// console.log("[CFN] Parent folder path from current file:", parentFolderPath);
		} else if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			// console.log("[CFN] Found active view:", activeView?.file?.path);
			if (activeView?.file) {
				const viewFilePath = activeView.file.path;
				const lastSlashIndex = viewFilePath.lastIndexOf('/');
				parentFolderPath = lastSlashIndex > 0 ? viewFilePath.substring(0, lastSlashIndex) : '';
				// console.log("[CFN] Parent folder path from view:", parentFolderPath);
			}
		}

		// Show warning if no valid folder path found
		if (!parentFolderPath) {
			const warningDiv = container.createDiv({ cls: 'empty-state-message' });
			warningDiv.createEl('p', {
				text: 'Please open a note in a folder to view related notes.',
				cls: 'empty-state-highlight'
			});
			warningDiv.createEl('p', {
				text: 'The root folder cannot be shown to prevent performance issues with large vaults.',
				cls: 'empty-state-subtext'
			});
			return;
		}

		// Show current folder path
		const pathDisplay = headerContainer.createEl('div', {
			cls: 'folder-path-display',
			text: parentFolderPath
		});
		pathDisplay.style.fontSize = 'var(--font-smaller)';
		pathDisplay.style.color = 'var(--text-muted)';
		pathDisplay.style.marginBottom = '10px';
		pathDisplay.style.wordBreak = 'break-word';

		// Get and filter files
		let folder = this.app.vault.getAbstractFileByPath(parentFolderPath);
		// console.log("[CFN] Found folder:", folder?.path);
		let files: TFile[] = [];
		if (folder instanceof TFolder) {
			files = folder.children.filter((file: any) => file instanceof TFile) as TFile[];
			// console.log("[CFN] Initial files count:", files.length);
		}

		files = this.applyFilters(files, parentFolderPath);
		// console.log("[CFN] Files after filtering:", files.length);
		// console.log("[CFN] Current filters - Include:", this.plugin.settings.includeTitleFilter, "Exclude:", this.plugin.settings.excludeTitlesFilter);

		if (files.length === 0) {
			this.showEmptyState(container, activeFile, currentFilePath, files);
			return;
		}

		// Sort files by name/sequence
		const sequenceWithPrefixOrLongest = (str: string) => {
			const tMatches = str.match(/T(\d+)/);
			if (tMatches) return parseInt(tMatches[1]);
			const yMatches = str.match(/Y(\d+)/);
			if (yMatches) return parseInt(yMatches[1]) + 1000;
			const matches = str.match(/\d+/g) || [];
			return Math.max(...matches.map(numStr => parseInt(numStr)), 0);
		};

		files.sort((a, b) => sequenceWithPrefixOrLongest(a.basename) - sequenceWithPrefixOrLongest(b.basename));
		const currentFileIndex = files.findIndex(file => file.path === currentFilePath);

		// Create main content container
		const mainContent = container.createDiv({ cls: 'main-content' });

		// Show navigation section if enabled and we have a current file
		if (showNavigation && currentFileIndex !== -1) {
			const navigationSection = mainContent.createDiv({ cls: 'navigation-section' });

			// Navigation header with prev/next
			const navHeader = navigationSection.createDiv({ cls: 'navigation-header' });

			// Previous note
			if (currentFileIndex > 0) {
				const prevNote = files[currentFileIndex - 1];
				const prevLink = navHeader.createDiv({ cls: 'nav-link prev-note' });
				const prevIcon = prevLink.createSpan({ cls: 'nav-icon' });
				prevIcon.innerHTML = `<svg viewBox="0 0 100 100" class="arrow-left" width="16" height="16"><path fill="currentColor" stroke="currentColor" d="M 60,20 L 30,50 L 60,80"></path></svg>`;
				prevLink.createSpan({ cls: 'nav-direction', text: 'Previous' });
				const prevTitle = prevLink.createSpan({
					cls: 'nav-title',
					text: this.getShortNoteName(prevNote.basename)
				});
				prevLink.setAttribute('aria-label', `Previous: ${prevNote.basename}`);
				prevLink.addEventListener('click', () => {
					this.app.workspace.openLinkText(prevNote.basename, parentFolderPath);
				});
			}

			// Next note
			if (currentFileIndex < files.length - 1) {
				const nextNote = files[currentFileIndex + 1];
				const nextLink = navHeader.createDiv({ cls: 'nav-link next-note' });
				nextLink.createSpan({ cls: 'nav-direction', text: 'Next' });
				const nextIcon = nextLink.createSpan({ cls: 'nav-icon' });
				nextIcon.innerHTML = `<svg viewBox="0 0 100 100" class="arrow-right" width="16" height="16"><path fill="currentColor" stroke="currentColor" d="M 40,20 L 70,50 L 40,80"></path></svg>`;
				const nextTitle = nextLink.createSpan({
					cls: 'nav-title',
					text: this.getShortNoteName(nextNote.basename)
				});
				nextLink.setAttribute('aria-label', `Next: ${nextNote.basename}`);
				nextLink.addEventListener('click', () => {
					this.app.workspace.openLinkText(nextNote.basename, parentFolderPath);
				});
			}

			// Current note outline - LAZY LOAD
			if (this.plugin.settings.includeCurrentFileOutline) {
				const currentFile = files[currentFileIndex];
				// Create the outline section first
				const outlineSection = navigationSection.createDiv({ cls: 'outline-section' });

				// Add current note title
				outlineSection.createEl('div', {
					cls: 'current-note-title',
					text: currentFile.basename
				});

				outlineSection.createEl('div', {
					cls: 'folder-section-header',
					text: 'CURRENT NOTE OUTLINE'
				});

				// Add a loading indicator
				const loadingEl = outlineSection.createEl('div', {
					cls: 'loading-indicator',
					text: 'Loading outline...'
				});

				// Load content asynchronously
				setTimeout(async () => {
					const fileContent = await this.app.vault.read(currentFile);
					if (fileContent) {
						// Remove loading indicator
						loadingEl.remove();
						// Create the headings
						this.createClickableHeadings(outlineSection, fileContent, currentFile.path, true);
					} else {
						loadingEl.setText('No content found');
					}
				}, 10);
			}

			// Add separator
			mainContent.createDiv({ cls: 'section-separator' });
		}

		// Always show flat list view
		const listContainer = mainContent.createDiv({ cls: 'notes-flat-list' });
		listContainer.createEl('div', {
			cls: 'folder-section-header',
			text: 'FOLDER NOTES'
		});

		// OPTIMIZE: Limit the number of files displayed at once to prevent memory issues
		const MAX_FILES_DISPLAY = 100; // Adjust based on testing
		const displayedFiles = files.slice(0, MAX_FILES_DISPLAY);
		const hasMoreFiles = files.length > MAX_FILES_DISPLAY;

		// Process files in batches to prevent UI freezing
		const BATCH_SIZE = 20;
		const processBatch = async (startIdx: number) => {
			const endIdx = Math.min(startIdx + BATCH_SIZE, displayedFiles.length);

			for (let i = startIdx; i < endIdx; i++) {
				const file = displayedFiles[i];
				const isCurrentFile = file.path === currentFilePath;
				const fileContainer = listContainer.createDiv({
					cls: isCurrentFile ? 'file-container current' : 'file-container'
				});

				this.createFileLink(fileContainer, file, currentFilePath, parentFolderPath);

				// Only load outlines if explicitly enabled
				if (this.plugin.settings.includeListFileOutlines) {
					// Add a placeholder initially
					const outlinePlaceholder = fileContainer.createEl('div', {
						cls: 'outline-placeholder',
						text: 'Loading outline...'
					});

					// Load outline in the next animation frame
					requestAnimationFrame(async () => {
						try {
							const fileContent = await this.app.vault.read(file);
							outlinePlaceholder.remove();
							if (fileContent) {
								this.createClickableHeadings(fileContainer, fileContent, file.path, isCurrentFile);
							}
						} catch (err) {
							console.error("Error loading outline:", err);
							outlinePlaceholder.setText("Failed to load outline");
						}
					});
				}
			}

			// Process next batch if needed
			if (endIdx < displayedFiles.length) {
				setTimeout(() => processBatch(endIdx), 50);
			}

			// Show message if we're not displaying all files
			if (hasMoreFiles && endIdx === displayedFiles.length) {
				listContainer.createEl('div', {
					cls: 'more-files-message',
					text: `Showing ${MAX_FILES_DISPLAY} of ${files.length} notes. Use filters to narrow results.`
				});
			}
		};

		// Start processing the first batch
		processBatch(0);

		// Apply display classes
		container.classList.add('compact-mode'); // Always use compact mode
		// container.classList.toggle('expanded-mode', displayMode === 'expanded'); // Removed
		container.classList.toggle('minimal-style', styleMode === 'minimal');
		container.classList.toggle('fancy-style', styleMode === 'fancy');
		container.classList.toggle('neobrutalist-style', styleMode === 'neobrutalist');
		const shouldApplyBiggerText = this.plugin.settings.biggerText &&
			(!this.plugin.settings.biggerTextMobileOnly || (this.app as any).isMobile);
		container.classList.toggle('bigger-text', shouldApplyBiggerText);

	}

	// Helper function to create file links with consistent styling
	createFileLink(container: HTMLElement, file: any, currentFilePath: string, parentFolderPath: string): void {
		const p = container.createEl('p');
		const a = p.createEl('a', { text: file.basename });

		if (this.plugin.settings.prettyTitleCase) {
			a.innerText = a.innerText.replace(/\w\S*/g, function(txt) {
				return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
			});
		}

		// Apply styling
		a.className = 'folder-notes-style';

		// If current file, add special styling
		if (file.path === currentFilePath) {
			a.className += ' current-file';
			a.innerText = '\u2605 ' + a.innerText;
		}

		// Add hover effects
		a.onmouseover = () => a.classList.add('hover-style-file');
		a.onmouseout = () => a.classList.remove('hover-style-file');

		// Add click handler to open the file
		a.addEventListener('click', () => {
			this.app.workspace.openLinkText(file.basename, parentFolderPath);
		});
	}

	// Helper method to show empty state
	private showEmptyState(container: HTMLElement, activeFile: TFile | null, currentFilePath: string, files: TFile[]): void {
		const emptyStateDiv = container.createDiv({ cls: 'empty-state-message' });
		if (files.length === 0) {
			emptyStateDiv.createEl('p', {
				text: 'No notes found. If you have recently added or moved notes, Obsidian might still be indexing them. Please wait a moment and try again.',
				cls: 'empty-state-highlight'
			});
		}
		if (this.plugin.settings.includeTitleFilter) {
			emptyStateDiv.createEl('p', {
				text: `🔍 No notes match the current filter "${this.plugin.settings.includeTitleFilter}".`,
				cls: 'empty-state-highlight'
			});
		} else if (this.plugin.settings.excludeTitlesFilter) {
			emptyStateDiv.createEl('p', {
				text: `All notes are currently filtered out by the exclude pattern "${this.plugin.settings.excludeTitlesFilter}"`,
			});
		} else {
			emptyStateDiv.createEl('p', {
				text: 'This folder is empty',
			});
		}

		if (currentFilePath && activeFile) {
			emptyStateDiv.createEl('p', {
				text: 'Showing outline of current note:',
				cls: 'empty-state-subtext'
			});

			// Add a loading indicator
			const loadingEl = emptyStateDiv.createEl('div', {
				cls: 'loading-indicator',
				text: 'Loading outline...'
			});

			// Load content asynchronously with timeout to prevent blocking UI
			setTimeout(async () => {
				try {
					const fileContent = await this.app.vault.read(activeFile);
					if (fileContent) {
						// Remove loading indicator
						loadingEl.remove();
						// Create the headings with a limited subset of content if it's large
						const contentSize = fileContent.length;
						if (contentSize > 100000) { // If content is very large (>100KB)
							const truncatedContent = fileContent.substring(0, 100000);
							this.createClickableHeadings(container as HTMLElement, truncatedContent, currentFilePath, true);
							container.createEl('p', {
								text: 'Note is very large. Only showing first portion of headings.',
								cls: 'empty-state-subtext'
							});
						} else {
							this.createClickableHeadings(container as HTMLElement, fileContent, currentFilePath, true);
						}
					} else {
						loadingEl.setText('No content found');
					}
				} catch (err) {
					console.error("Error loading outline:", err);
					loadingEl.setText("Failed to load outline");
				}
			}, 10);
		}
	}

	private applyFilters(files: TFile[], parentFolderPath: string): TFile[] {
		// Create a single-pass filter function to avoid multiple array iterations
		return files.filter(file => {
			// Skip files in subfolders if that setting is disabled
			if (!this.plugin.settings.includeSubfolderNotes &&
				file.path.substring(parentFolderPath.length + 1).includes('/')) {
				return false;
			}

			const lowerBasename = file.basename.toLowerCase();

			// Check exclude filter
			const excludeFilter = this.plugin.settings.excludeTitlesFilter;
			if (excludeFilter && excludeFilter.length > 0) {
				const excludeWords = excludeFilter.split(/[,\s]+/).filter(word => word.trim().length > 0)
					.map(word => word.trim().toLowerCase());

				if (excludeWords.length > 0 &&
					excludeWords.some(word => lowerBasename.includes(word))) {
					return false;
				}
			}

			// Check include filter
			const includesFilter = this.plugin.settings.includeTitleFilter;
			if (includesFilter && includesFilter.length > 0) {
				const includeWords = includesFilter.split(/[,\s]+/).filter(word => word.trim().length > 0)
					.map(word => word.trim().toLowerCase());

				if (includeWords.length > 0 &&
					!includeWords.some(word => lowerBasename.includes(word))) {
					return false;
				}
			}

			return true;
		});
	}
}

class CurrentFolderNotesDisplaySettingTab extends PluginSettingTab {
	plugin: CurrentFolderNotesDisplay;

	constructor(app: App, plugin: CurrentFolderNotesDisplay) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Add some CSS for styling the settings
		containerEl.createEl('style', {
			text: `
				.settings-section {
					margin-bottom: 24px;
					border-bottom: 1px solid var(--background-modifier-border);
					padding-bottom: 16px;
				}
				.settings-section-header {
					margin-bottom: 12px;
					font-size: 16px;
					font-weight: 600;
					color: var(--text-normal);
				}
				.settings-section-description {
					margin-bottom: 12px;
					font-size: 13px;
					color: var(--text-muted);
				}
				.setting-item {
					border-top: none !important;
					padding-top: 12px !important;
				}
				.setting-item-description {
					font-size: 12px !important;
				}
			`
		});

		// Title section with plugin description
		const titleEl = containerEl.createDiv({ cls: 'settings-section' });
		titleEl.createEl('h2', { text: 'Current Folder Notes Settings' });
		titleEl.createEl('p', {
			cls: 'settings-section-description',
			text: 'Configure how notes from the current folder are displayed in the panel.'
		});

		// Filter settings section
		const filtersEl = containerEl.createDiv({ cls: 'settings-section' });
		filtersEl.createEl('h3', { cls: 'settings-section-header', text: '📂 Filter Settings' });
		filtersEl.createEl('p', {
			cls: 'settings-section-description',
			text: 'Control which notes appear in the folder notes panel.'
		});

		new Setting(filtersEl)
			.setName('Exclude titles filter')
			.setDesc('Notes containing these words will be hidden. Separate multiple words with commas.')
			.addText(text => text
				.setPlaceholder('_index, draft, template')
				.setValue(this.plugin.settings.excludeTitlesFilter)
				.onChange(async (value) => {
					this.plugin.settings.excludeTitlesFilter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(filtersEl)
			.setName('Include titles filter')
			.setDesc('Only notes containing these words will be shown. Leave empty to show all notes. Separate multiple words with commas.')
			.addText(text => text
				.setPlaceholder('chapter, section, lesson')
				.setValue(this.plugin.settings.includeTitleFilter)
				.onChange(async (value) => {
					this.plugin.settings.includeTitleFilter = value;
					await this.plugin.saveSettings();
				}));

		// Display options section
		const displayEl = containerEl.createDiv({ cls: 'settings-section' });
		displayEl.createEl('h3', { cls: 'settings-section-header', text: '🖥️ Display Options' });
		displayEl.createEl('p', {
			cls: 'settings-section-description',
			text: 'Control how notes and their contents are displayed in the panel.'
		});

		new Setting(displayEl)
			.setName('Show navigation')
			.setDesc('Show navigation links for previous and next notes.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showNavigation)
				.onChange(async (value) => {
					this.plugin.settings.showNavigation = value;
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

		new Setting(displayEl)
			.setName('Pretty title case')
			.setDesc('Convert note titles to Title Case for better readability.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.prettyTitleCase)
				.onChange(async (value) => {
					this.plugin.settings.prettyTitleCase = value;
					await this.plugin.saveSettings();
				}));

		new Setting(displayEl)
			.setName('Style mode')
			.setDesc('Choose between minimal, fancy, and neobrutalist styles.')
			.addDropdown(dropdown => dropdown
				.addOption('minimal', 'Minimal')
				.addOption('fancy', 'Fancy')
				.addOption('neobrutalist', 'Neobrutalist')
				.setValue(this.plugin.settings.styleMode)
				.onChange(async (value) => {
					this.plugin.settings.styleMode = value as 'minimal' | 'fancy' | 'neobrutalist';
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

		new Setting(displayEl)
			.setName('Bigger text')
			.setDesc('Make all the text bigger for easier clicking.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.biggerText)
				.onChange(async (value) => {
					this.plugin.settings.biggerText = value;
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

			// Add this after the existing biggerText setting
			new Setting(displayEl)
				.setName('Mobile-only bigger text')
				.setDesc('Only apply bigger text when using Obsidian on mobile devices.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.biggerTextMobileOnly)
					.onChange(async (value) => {
						this.plugin.settings.biggerTextMobileOnly = value;
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					}));

		// Content options section
		const contentEl = containerEl.createDiv({ cls: 'settings-section' });
		contentEl.createEl('h3', { cls: 'settings-section-header', text: '📝 Content Options' });
		contentEl.createEl('p', {
			cls: 'settings-section-description',
			text: 'Configure what content is included in the folder notes panel.'
		});

		new Setting(contentEl)
			.setName('Include subfolder notes')
			.setDesc('Show notes from subfolders within the current folder.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeSubfolderNotes)
				.onChange(async (value) => {
					this.plugin.settings.includeSubfolderNotes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(contentEl)
			.setName('Show outline in current file section')
			.setDesc('Display headings from the currently active file at the top of the panel.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeCurrentFileOutline)
				.onChange(async (value) => {
					this.plugin.settings.includeCurrentFileOutline = value;
					await this.plugin.saveSettings();
				}));

		new Setting(contentEl)
			.setName('Show outline in files list')
			.setDesc('Display headings under each file in the folder notes list.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeListFileOutlines)
				.onChange(async (value) => {
					this.plugin.settings.includeListFileOutlines = value;
					await this.plugin.saveSettings();
				}));

		// About section with help text
		const aboutEl = containerEl.createDiv({ cls: 'settings-section' });
		aboutEl.createEl('h3', { cls: 'settings-section-header', text: 'ℹ️ About' });
		aboutEl.createEl('p', {
			cls: 'settings-section-description',
			text: 'Current Folder Notes displays notes and outlines from the current folder for quick navigation. Changes to settings will apply immediately.'
		});

		// Add a refresh button to explicitly refresh the view
		new Setting(aboutEl)
			.setName('Refresh panel')
			.setDesc('Manually refresh the Current Folder Notes panel to apply changes.')
			.addButton(button => button
				.setButtonText('Refresh Now')
				.setCta()
				.onClick(() => {
					this.plugin.refreshView();
					new Notice('Current Folder Notes panel refreshed');
				}));
	}
}


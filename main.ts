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
	includeAllFilesOutline: boolean;
	displayMode: 'compact' | 'expanded';
	styleMode: 'minimal' | 'fancy';
	showNavigation: boolean;
}

const DEFAULT_SETTINGS: Partial<CurrentFolderNotesDisplaySettings> = {
	excludeTitlesFilter: '_index',
	includeTitleFilter: '',
	prettyTitleCase: true,
	includeSubfolderNotes: false,
	includeCurrentFileOutline: true,
	includeAllFilesOutline: false,
	displayMode: 'expanded',
	styleMode: 'fancy',
	showNavigation: false
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

		// when file is changes (opened) in the editor, update the view
		this.registerEvent(this.app.workspace.on('file-open', async (file) => {
			this.refreshView();
		}));

		// when a file is deleted, update the view
		this.registerEvent(this.app.vault.on('delete', async (file) => {
			this.refreshView();
		}));

		// when a file is created, update the view
		this.registerEvent(this.app.vault.on('create', async (file) => {
			this.refreshView();
		}));

		// when a file is renamed, update the view
		this.registerEvent(this.app.vault.on('rename', async (file) => {
			this.refreshView();
		}));
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
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);
		
		// Make sure we only have one leaf of our type
		if (leaves.length > 1) {
			// Keep the first one, detach others
			for (let i = 1; i < leaves.length; i++) {
				leaves[i].detach();
			}
		}
		
		if (leaves.length === 1) {
			// A leaf with our view exists, update it
			const view = leaves[0].view as CurrentFolderNotesDisplayView;
			await view.displayNotesInCurrentFolder();
		} else if (leaves.length === 0) {			
			// No leaf exists, create one
			this.activateView();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
		// check icon is valid 
		// if (this.plugin.settings.iconUsed) {
		// 	// TODO check that this is a valid icon
		// 	return this.plugin.settings.iconUsed;
		// }
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
		const headings: RegExpMatchArray | null = currentFileContent.match(/^(#+)\s+(.*)$/gm);
		if (headings) {
			headings.forEach((heading: string) => {
				const headingLevelMatch: RegExpMatchArray | null = heading.match(/^(#+)/);
				if (headingLevelMatch) {
					const headingLevel: number = headingLevelMatch[0].length;
					let headingText: string = heading.replace(/^(#+)\s+/, '');

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
					
					p.addEventListener('click', async (event) => {
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
				}
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
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// Get display settings
		const displayMode = this.plugin.settings.displayMode;
		const styleMode = this.plugin.settings.styleMode;
		const showNavigation = this.plugin.settings.showNavigation;

		// Create header
		const headerContainer = container.createDiv({ cls: 'folder-view-header' });
		headerContainer.createEl("h6", { text: "Current Folder Notes" });
		
		// Get current file info
		const activeFile = this.app.workspace.getActiveFile();
		const currentFilePath = activeFile ? activeFile.path : '';
		const parentFolderPath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
		
		// Show current folder path
		if (parentFolderPath) {
			const pathDisplay = headerContainer.createEl('div', { 
				cls: 'folder-path-display',
				text: parentFolderPath
			});
			pathDisplay.style.fontSize = 'var(--font-smaller)';
			pathDisplay.style.color = 'var(--text-muted)';
			pathDisplay.style.marginBottom = '10px';
			pathDisplay.style.wordBreak = 'break-word';
		}

		// Get and filter files
		let folder = this.app.vault.getAbstractFileByPath(parentFolderPath);
		let files: TFile[] = [];
		if (folder instanceof TFolder) {
			files = folder.children.filter((file: any) => file instanceof TFile) as TFile[];
		}

		files = this.applyFilters(files, parentFolderPath);
		
		if (files.length === 0) {
			this.showEmptyState(container, activeFile, currentFilePath);
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

			// Current note outline
			if (this.plugin.settings.includeCurrentFileOutline) {
				const currentFile = files[currentFileIndex];
				const fileContent = await this.app.vault.read(currentFile);
				if (fileContent) {
					const outlineSection = navigationSection.createDiv({ cls: 'outline-section' });
					outlineSection.createEl('div', { 
						cls: 'folder-section-header',
						text: 'CURRENT NOTE OUTLINE'
					});
					this.createClickableHeadings(outlineSection, fileContent, currentFile.path, true);
				}
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
		
		for (const file of files) {
			const isCurrentFile = file.path === currentFilePath;
			const fileContainer = listContainer.createDiv({ 
				cls: isCurrentFile ? 'file-container current' : 'file-container' 
			});

			this.createFileLink(fileContainer, file, currentFilePath, parentFolderPath);
			
			if ((isCurrentFile && this.plugin.settings.includeCurrentFileOutline) || 
				this.plugin.settings.includeAllFilesOutline) {
				const fileContent = await this.app.vault.read(file);
				if (fileContent) {
					this.createClickableHeadings(fileContainer, fileContent, file.path, isCurrentFile);
				}
			}
		}

		// Apply display classes
		container.classList.toggle('compact-mode', displayMode === 'compact');
		container.classList.toggle('expanded-mode', displayMode === 'expanded');
		container.classList.toggle('minimal-style', styleMode === 'minimal');
		container.classList.toggle('fancy-style', styleMode === 'fancy');
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
	private showEmptyState(container: HTMLElement, activeFile: TFile | null, currentFilePath: string): void {
		const emptyStateDiv = container.createDiv({ cls: 'empty-state-message' });
		
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
			
			this.app.vault.read(activeFile).then(fileContent => {
				if (fileContent) {
					this.createClickableHeadings(container as HTMLElement, fileContent, currentFilePath, true);
				}
			});
		}
	}

	private applyFilters(files: TFile[], parentFolderPath: string): TFile[] {
		let filteredFiles = files;
	
		// Apply subfolder filter
		if (!this.plugin.settings.includeSubfolderNotes) {
			filteredFiles = filteredFiles.filter(file => !file.path.substring(parentFolderPath.length + 1).includes('/'));
		}
	
		// Apply include filter
		const includesFilter = this.plugin.settings.includeTitleFilter;
		if (includesFilter && includesFilter.length > 0) {
			const includeWords = includesFilter.split(/[,\s]+/).map(word => word.trim().toLowerCase());
			if (includeWords.length > 0) {
				filteredFiles = filteredFiles.filter(file => 
					includeWords.some(word => file.basename.toLowerCase().includes(word))
				);
			}
		}
	
		// Apply exclude filter
		const excludeFilter = this.plugin.settings.excludeTitlesFilter;
		if (excludeFilter && excludeFilter.length > 0) {
			const excludeWords = excludeFilter.split(/[,\s]+/).map(word => word.trim().toLowerCase());
			if (excludeWords.length > 0) {
				filteredFiles = filteredFiles.filter(file => 
					!excludeWords.some(word => file.basename.toLowerCase().includes(word))
				);
			}
		}
	
		return filteredFiles;
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
			.setName('Display mode')
			.setDesc('Choose between compact and expanded display modes.')
			.addDropdown(dropdown => dropdown
				.addOption('compact', 'Compact')
				.addOption('expanded', 'Expanded')
				.setValue(this.plugin.settings.displayMode)
				.onChange(async (value) => {
					this.plugin.settings.displayMode = value as 'compact' | 'expanded';
					await this.plugin.saveSettings();
				}));

		new Setting(displayEl)
			.setName('Style mode')
			.setDesc('Choose between minimal and fancy styles.')
			.addDropdown(dropdown => dropdown
				.addOption('minimal', 'Minimal')
				.addOption('fancy', 'Fancy')
				.setValue(this.plugin.settings.styleMode)
				.onChange(async (value) => {
					this.plugin.settings.styleMode = value as 'minimal' | 'fancy';
					await this.plugin.saveSettings();
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
			.setName('Show outline of current file')
			.setDesc('Display headings from the currently active file for quick navigation.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeCurrentFileOutline)
				.onChange(async (value) => {
					this.plugin.settings.includeCurrentFileOutline = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(contentEl)
			.setName('Show outline of all files')
			.setDesc('Display headings from all files in the current folder. May impact performance with many files.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeAllFilesOutline)
				.onChange(async (value) => {
					this.plugin.settings.includeAllFilesOutline = value;
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

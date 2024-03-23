import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { ItemView, WorkspaceLeaf } from "obsidian";

// Remember to rename these classes and interfaces!

interface CurrentFolderNotesDisplaySettings {
	ExcludeTitlesFilter: string;
}

const DEFAULT_SETTINGS: Partial<CurrentFolderNotesDisplaySettings> = {
	ExcludeTitlesFilter: '_index',
}

export default class CurrentFolderNotesDisplay extends Plugin {
	settings: CurrentFolderNotesDisplaySettings;

	async onload() {
		await this.loadSettings();

		// add a panel to the right sidebar - view 
		this.registerView(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, (leaf) => new CurrentFolderNotesDisplayView(leaf));

		// Add a ribbon icon
		this.addRibbonIcon('folder', 'Activate Folder Notes Display', () => {
			// new Notice('This is a notice!');
			this.activateView();
		});


		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CurrentFolderNotesDisplaySettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);

		if (leaves.length) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, active: true });
			}
		}

		if (!leaf) {
			new Notice('Could not create a new leaf for the view');
			return;
		}
		workspace.revealLeaf(leaf);
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
	settings: CurrentFolderNotesDisplaySettings;
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY;
	}

	getDisplayText() {
		return "CurrentFolderNotesDisplay view";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		container.createEl("h4", { text: "Notes in Current Folder" });

		// Get the current file's path
		const activeFile = this.app.workspace.getActiveFile();
		const currentFilePath = activeFile ? activeFile.path : '';

		// Extract the parent folder path
		const parentFolderPath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));

		// Get all markdown files in the vault
		const allMarkdownFiles = this.app.vault.getMarkdownFiles();

		// Filter the files to only include those in the parent folder
		const parentFolderFiles = allMarkdownFiles.filter(file => file.path.startsWith(parentFolderPath));

		// Filter out notes that match the exclude filter
		// const excludeFilter = this.plugin.settings.ExcludeTitlesFilter;
		

		const filteredFiles = parentFolderFiles;

		// Iterate over the files and add their names to the container
		filteredFiles.forEach(file => {
			const p = container.createEl('p');
			const a = p.createEl('a', { text: file.basename });
			a.style.cursor = 'pointer';
			a.style.color = 'var(--text-accent)';
			a.style.textDecoration = 'underline';
			a.addEventListener('click', () => {
				this.app.workspace.openLinkText(file.basename, parentFolderPath);
			});
		});
	}

	async onClose() {
		// Nothing to clean up.
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

		new Setting(containerEl)
			.setName('Exclude Titles Filter')
			.setDesc('What notes to exclude from the view')
			.addText(text => text
				.setPlaceholder('_Index')
				.setValue(this.plugin.settings.ExcludeTitlesFilter)
				.onChange(async (value) => {
					this.plugin.settings.ExcludeTitlesFilter = value;
					await this.plugin.saveSettings();
				}));
	}
}

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
	// iconUsed: string;
}

const DEFAULT_SETTINGS: Partial<CurrentFolderNotesDisplaySettings> = {
	excludeTitlesFilter: '_index',
	includeTitleFilter: '',
	prettyTitleCase: true,
	includeSubfolderNotes: false,
	includeCurrentFileOutline: true,
	includeAllFilesOutline: false,
	// iconUsed: 'folder',
}

export default class CurrentFolderNotesDisplay extends Plugin {
	settings: CurrentFolderNotesDisplaySettings;

	fileChangeHandler(file: TFile) {
        if (file instanceof TFile && file.path === this.file.path) {
            this.load();
        }
        this.panes = []; // Initialize the array in the constructor
        // Close all tracked panes when the plugin is unloaded
        for (const pane of this.panes) {
            if (!pane.isDetached()) {
                pane.detach();
            }
        }
        this.panes = []; // Clear the array after closing the panes

        // ... existing code ...
    }

    async onload() {
        await this.loadSettings();

        // Example of opening a pane and adding it to the panes array
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({ type: 'markdown' });
        this.panes.push(leaf); // Add the pane to the panes array

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CurrentFolderNotesDisplaySettingTab(this.app, this));


		// add a panel to the right sidebar - view 
		// this.registerView(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, (leaf) => new CurrentFolderNotesDisplayView(leaf));
		this.registerView(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY, (leaf) => new CurrentFolderNotesDisplayView(leaf, this));
		// Add a ribbon icon
		this.addRibbonIcon('folder', 'Activate folder notes display', () => {
			// new Notice('This is a notice!');
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
			// let views = this.app.workspace.getLeavesOfType(CurrentFolderNotesDisplayView);
			// let view = this.app.workspace.getActiveViewOfType(CurrentFolderNotesDisplayView);
			this.refreshView();

		}));

		// when a file is saved, update the view
		// this.registerEvent(this.app.vault.on('modify', async (file) => {
		// 	this.refreshView();
		// }));

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

	onunload() {
		console.log('unloading plugin');
		


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

	async refreshView() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CURRENT_FOLDER_NOTES_DISPLAY);
		if (leaves.length) {
			// A leaf with our view already exists, use that
			const view = leaves[0].view as CurrentFolderNotesDisplayView;
			await view.displayNotesInCurrentFolder();
		} else {
			new Notice('Could not find the view');
			this.activateView();
		}

		// // if this view is not open do nothing
		// let view = this.app.workspace.getActiveViewOfType(CurrentFolderNotesDisplayView);
		// if (view) {
		// 	await view.displayNotesInCurrentFolder();
		// }

	

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
		// close current view 

	}

	// main.ts
	

	// Function to create clickable headings
	createClickableHeadings(container: HTMLElement, currentFileContent: string, currentFilePath: string, addExtraHeadingCSS: boolean): void {
		const headings: RegExpMatchArray | null = currentFileContent.match(/^(#+)\s+(.*)$/gm);
		if (headings) {
			headings.forEach((heading: string) => {
				const headingLevelMatch: RegExpMatchArray | null = heading.match(/^(#+)/);
				if (headingLevelMatch) {
					// const headingLevel: number = headingLevelMatch[0].length;
					let headingText: string = heading.replace(/^(#+)\s+/, '');

					// Use extractAlias to get the alias from the heading text
					headingText = this.extractAlias(headingText);
					// Add a right arrow symbol to the heading text
					let headingLabel = '→ ' + headingText;

					const p: HTMLElement = container.createEl('p', { text: headingLabel });
					// p.style.marginLeft = `${headingLevel * 10}px`;
					p.classList.add('basic-heading');
					if (addExtraHeadingCSS) {
						p.classList.add('extra-heading-style');
					}
					p.addEventListener('click', async () => {
						this.app.workspace.openLinkText('#' + headingText, currentFilePath, false);
						// do an escape to deselect the text
						// const selection = window.getSelection();
						// if (selection) {
						// 	selection.removeAllRanges();
						// }
					});

					// Add hover effect
					p.onmouseover = () => {		
						// console.log('Mouse over:', headingText);
						p.classList.add('hover-style-heading');
					}
					// Remove hover effect when not hovering
					p.onmouseout = () => {
						// console.log('Mouse out:', headingText);
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

	async displayNotesInCurrentFolder(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();

		// const longestNumSequence = (str: string) => {
		// 	const matches = str.match(/\d+/g) || [];
		// 	return Math.max(...matches.map(numStr => parseInt(numStr)), 0);
		// };

		const sequenceWithPrefixOrLongest = (str: string) => {
			const tMatches = str.match(/T(\d+)/);
			if (tMatches) return parseInt(tMatches[1]); 

			const yMatches = str.match(/Y(\d+)/);
			if (yMatches) return parseInt(yMatches[1]) + 1000;// give T priority over Year

			const matches = str.match(/\d+/g) || [];
			return Math.max(...matches.map(numStr => parseInt(numStr)), 0);
		};

		// container.createEl("h5", { text: "Current Folder Notes" });
		// smaller title
		container.createEl("h6", { text: "Current Folder Notes" });

		// Get the current file's path
		const activeFile = this.app.workspace.getActiveFile();
		const currentFilePath = activeFile ? activeFile.path : '';

		// Extract the parent folder path
		const parentFolderPath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));

		// Get all markdown files in the vault

		// Filter the files to only include those in the parent folder
		// let parentFolderFiles = allMarkdownFiles.filter(file => file.path.startsWith(parentFolderPath));

		let folder = this.app.vault.getAbstractFileByPath(parentFolderPath);
		let parentFolderFiles: any[] = [];
		if (folder instanceof TFolder) {
			parentFolderFiles = folder.children;
		}

		const includesFilter = this.plugin.settings.includeTitleFilter;
		if (includesFilter && includesFilter.length > 0) {
			// convert this text to a list of words separated by commas
			let possibleFilteredFiles = parentFolderFiles;
			if (includesFilter.includes(',') || includesFilter.includes(' ')) {
				let includeWords = includesFilter.split(',');
				// remove spaces from the words
				includeWords.forEach((word, index) => {
					includeWords[index] = word.trim();
				});

				// if there are words use to filter files 
				if (includeWords.length > 0) {
					possibleFilteredFiles = parentFolderFiles.filter(file => includeWords.some(word => file.basename.toLowerCase().includes(word.toLowerCase())));
				} else {
					possibleFilteredFiles = parentFolderFiles;
				}

				/* The line `console.log(includeWords);` is logging the array `includeWords` to the console. This
				is helpful for debugging and understanding the content of the array at that point in the code
				execution. It allows you to see the individual words extracted from the `includesFilter` string
				and trimmed of any extra spaces. */
				// console.log(includeWords);
				// filter out notes that do not include any of the words in the filter and do it in a case insensitive way
				
				// const possibleFilteredFiles = parentFolderFiles.filter(file => file.basename.includes(includesFilter));;
			} else {
				// filter out notes that do not include the words in the filter and do it in a case insensitive way
				possibleFilteredFiles = parentFolderFiles.filter(file => file.basename.toLowerCase().includes(includesFilter.toLowerCase()));
			}
			// filter out notes that do not include the words in the filter
			// const possibleFilteredFiles = parentFolderFiles.filter(file => file.basename.includes(includesFilter));
			if (possibleFilteredFiles.length == 0) {
				container.createEl('p', { text: `No notes found in the current folder that include "${includesFilter}"` });
				return;
			}
			parentFolderFiles = possibleFilteredFiles;
		}


		let parentFolderFilesNoSubfolders = parentFolderFiles;
		if (!this.plugin.settings.includeSubfolderNotes) {
			// Exclude notes in subfolders from the list
			parentFolderFilesNoSubfolders = parentFolderFiles.filter(file => !file.path.substring(parentFolderPath.length + 1).includes('/'));
		} 

		// Get the exclude filter
		const excludeFilter = this.plugin.settings.excludeTitlesFilter;

		let filteredFiles = parentFolderFilesNoSubfolders;
		let possibleFilteredFiles = parentFolderFilesNoSubfolders;
		if (excludeFilter.length > 0) {
			// let the exclude filter work with a list of words separated by commas
			if (excludeFilter.includes(',')) {
				let excludeWords = excludeFilter.split(',');
				// remove spaces from the words
				excludeWords.forEach((word, index) => {
					excludeWords[index] = word.trim();
				});
				// filter out notes that do not include any of the words in the filter and do it in a case insensitive way
				possibleFilteredFiles = parentFolderFilesNoSubfolders.filter(file => !excludeWords.some(word => file.basename.toLowerCase().includes(word.toLowerCase())));
			} else {

				// Filter out notes that match the exclude filter
				possibleFilteredFiles = parentFolderFilesNoSubfolders.filter(file => !file.basename.includes(excludeFilter));
				
			}
			if (possibleFilteredFiles.length == 0) {
				container.createEl('p', { text: `No notes found in the current folder that do not include "${excludeFilter}"` });
				return;
			}
			filteredFiles = possibleFilteredFiles;
		}

		// If there are no notes in the folder, display a message
		if (filteredFiles.length === 0) {
			container.createEl('p', { text: 'No notes in this folder' });
			return;
		}

		// Sort the files by name
		// filteredFiles.sort((a, b) => a.basename.localeCompare(b.basename));
		filteredFiles.sort((a, b) => sequenceWithPrefixOrLongest(a.basename) - sequenceWithPrefixOrLongest(b.basename));

		

		// Iterate over the files and add their names to the container
		for (const file of filteredFiles) {
			const p = container.createEl('p');
			const a = p.createEl('a', { text: file.basename });
			if (this.plugin.settings.prettyTitleCase) {
				a.innerText = a.innerText.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
			}
			// make the items similar to file explorer
			a.className = 'folder-notes-style';
			// If the file path matches the current file path, assign the 'current-file' class
			if (file.path === currentFilePath) {
				a.className += ' current-file';
				a.innerText = '\u2605 ' + a.innerText;
			}

			// check for headings 
			var MyHeadings = false;
			var ThisFileContent = '';
			// var currentFile = this.app.workspace.getActiveFile();
			if (this.plugin.settings.includeAllFilesOutline || this.plugin.settings.includeCurrentFileOutline) {
				if (file) {
					ThisFileContent = await this.app.vault.read(file);
					MyHeadings = true;
				}
			}

			if (this.plugin.settings.includeAllFilesOutline && file.path !== currentFilePath) {
				if (MyHeadings) {
					this.createClickableHeadings(container as HTMLElement, ThisFileContent, file.path, false);
				}
			}

			if ((this.plugin.settings.includeAllFilesOutline || this.plugin.settings.includeCurrentFileOutline) && file.path === currentFilePath) {
				if (MyHeadings) {
					this.createClickableHeadings(container as HTMLElement, ThisFileContent, file.path, true);
				}
			}

			// make pretty when hover 
			a.onmouseover = () => {				
				a.classList.add('hover-style-file');
			}
			// and remove when not hovering
			a.onmouseout = () => {
				a.classList.remove('hover-style-file');
			}

			// When a note is clicked, open it in the workspace
			a.addEventListener('click', () => {
				this.app.workspace.openLinkText(file.basename, parentFolderPath);
			});
		}
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

		// heading for filters 
		// new Setting(containerEl).setName('Title filters').setHeading();


		new Setting(containerEl)
			.setName('Exclude titles filter')
			.setDesc('What notes to exclude from the view. This can be a list of words seperated by commas.')
			.addText(text => text
				.setPlaceholder('_Index')
				.setValue(this.plugin.settings.excludeTitlesFilter)
				.onChange(async (value) => {
					this.plugin.settings.excludeTitlesFilter = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Includes titles filter')
			.setDesc('Only include notes with this in their title. This can be a list of words seperated by commas.')
			.addText(text => text
				.setPlaceholder('Chapter')
				.setValue(this.plugin.settings.includeTitleFilter)
				.onChange(async (value) => {
					this.plugin.settings.includeTitleFilter = value;
					await this.plugin.saveSettings();
				}));
		
		// heading for options
		// new Setting(containerEl).setName('View Options').setHeading();
		// containerEl.createEl("h2", { text: "Options" });
		
		// option to do a pretty title case for the notes
		new Setting(containerEl)
			.setName('Pretty title case')
			.setDesc('Convert the note titles to Title Case')
			// option to reset this setting
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.prettyTitleCase)
				.onChange(async (value) => {
					this.plugin.settings.prettyTitleCase = value;
					await this.plugin.saveSettings();
				}));
		
		// option to include subfolder notes 
		new Setting(containerEl)
			.setName('Include subfolder notes')
			.setDesc('Include notes in subfolders of the current folder')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeSubfolderNotes)
				.onChange(async (value) => {
					this.plugin.settings.includeSubfolderNotes = value;
					await this.plugin.saveSettings();
				}));
		
		// option to include outline of current file
		new Setting(containerEl)
			.setName('Include outline of current file')
			.setDesc('Include the outline of the current file in the view')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeCurrentFileOutline)
				.onChange(async (value) => {
					this.plugin.settings.includeCurrentFileOutline = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Include outline of all files in the current folder')
			.setDesc('Include outline of all files in the current folder')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeAllFilesOutline)
				.onChange(async (value) => {
					this.plugin.settings.includeAllFilesOutline = value;
					await this.plugin.saveSettings();
				}));
		
		// option to pick icon 
		// let iconButton: HTMLElement; // Declare the iconButton variable

		// new Setting(containerEl)
		// 	.setName('Icon')
		// 	.setDesc('Choose an icon for the view')
		// 	.addText(text => text
		// 		.setPlaceholder('folder')
		// 		.onChange(async (value) => {
		// 			// do something with the value
		// 			this.plugin.settings.iconUsed = value;
		// 			await this.plugin.saveSettings();
		// 			(iconButton as HTMLButtonElement & { setIcon: (icon: string) => void }).setIcon(value); // Cast iconButton to a type that has the setIcon method
		// 		}))
		// 	.addButton(button => button
		// 		.setTooltip('Current Icon')
		// 		.setIcon(this.plugin.settings.iconUsed));
				

	}
}

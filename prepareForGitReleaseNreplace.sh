# minor version bump 
npm version patch

# create the current_release directory if it does not exist
mkdir -p current-folder-notes

# make a copy of the main.js, manifest.json, and styles.css files in another folder
cp main.js current-folder-notes
cp manifest.json current-folder-notes
cp styles.css current-folder-notes

rm -f "/Users/caffae/Notes/Char V4/.obsidian/plugins/Current Folder Notes/main.js"
rm -f "/Users/caffae/Notes/Char V4/.obsidian/plugins/Current Folder Notes/manifest.json"
rm -f "/Users/caffae/Notes/Char V4/.obsidian/plugins/Current Folder Notes/styles.css"

cp main.js "/Users/caffae/Notes/Char V4/.obsidian/plugins/Current Folder Notes"
cp manifest.json "/Users/caffae/Notes/Char V4/.obsidian/plugins/Current Folder Notes"
cp styles.css "/Users/caffae/Notes/Char V4/.obsidian/plugins/Current Folder Notes"

# compress the current_release folder into a zip file
# zip -r release.zip current_release
zip -vr current-folder-notes.zip current-folder-notes -x "*.DS_Store"

mv current-folder-notes.zip release.zip

# remove the current_release folder
# rm -rf current-folder-notes


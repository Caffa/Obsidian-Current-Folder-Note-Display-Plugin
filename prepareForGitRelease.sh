# minor version bump 
# npm version patch

# create the current_release directory if it does not exist
mkdir -p release

# make a copy of the main.js, manifest.json, and styles.css files in another folder
cp main.js release
cp manifest.json release
cp styles.css release

# compress the current_release folder into a zip file
# zip -r release.zip current_release
zip -vr release.zip release -x "*.DS_Store"

# remove the current_release folder
rm -rf release


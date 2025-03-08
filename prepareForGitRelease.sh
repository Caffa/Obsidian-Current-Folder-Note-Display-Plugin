# minor version bump 
npm version patch

# create the current_release directory if it does not exist
mkdir -p current-folder-notes

# make a copy of the main.js, manifest.json, and styles.css files in another folder
cp main.js current-folder-notes
cp manifest.json current-folder-notes
cp styles.css current-folder-notes

# compress the current_release folder into a zip file
# zip -r release.zip current_release
zip -vr current-folder-notes.zip current-folder-notes -x "*.DS_Store"

mv current-folder-notes.zip release.zip

# remove the current_release folder
# rm -rf current-folder-notes

# gac "Push for Release" 
git add -A
git commit -m "Prepare for Git Release"
# git push origin main
echo "Pushing to main tag... "
echo "git push origin tag 1.0.4"
echo "Creating a new release... "
echo 'gh release create 1.0.4 release.zip main.js manifest.json styles.css --title "Aesthetics" --notes "Improve aesthetics"'
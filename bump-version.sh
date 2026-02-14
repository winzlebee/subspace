#!/bin/bash

# Usage: ./bump-version.sh <new_version>
# Example: ./bump-version.sh 0.2.0

if [ -z "$1" ]; then
  echo "Usage: $0 <new_version>"
  exit 1
fi

NEW_VERSION=$1

echo "Bumping version to $NEW_VERSION..."

# 1. Update package.json
# Using npm version to update package.json (and package-lock.json if it existed) without git tag/commit
npm version $NEW_VERSION --no-git-tag-version --allow-same-version

# 2. Update Tauri config (src-tauri/tauri.conf.json)
# Using sed to find "version": "..." and replace it
# We match "version": "x.y.z" carefully to avoid replacing other things
sed -i 's/"version": "[0-9]*\.[0-9]*\.[0-9]*"/"version": "'$NEW_VERSION'"/' src-tauri/tauri.conf.json

# 3. Update Cargo.toml files
# We need to update server, shared, and src-tauri Cargo.toml files
# We use a loop to handle them
CARGO_FILES=("server/Cargo.toml" "shared/Cargo.toml" "src-tauri/Cargo.toml")

for file in "${CARGO_FILES[@]}"; do
  # Replace version = "..." with version = "NEW_VERSION"
  # match ^version = "..." to only target the package version, not dependencies
  sed -i 's/^version = "[0-9]*\.[0-9]*\.[0-9]*"/version = "'$NEW_VERSION'"/' "$file"
done

# 4. Update Cargo.lock
# Running cargo check will update the lockfile
echo "Updating Cargo.lock..."
cargo check

echo "Done! Version bumped to $NEW_VERSION across all files."
echo "Committing version bump..."
git commit -am "Bump version to v$NEW_VERSION"

echo "Tagging v$NEW_VERSION..."
git tag "v$NEW_VERSION"

echo "Pushing changes and tag..."
git push
git push origin "v$NEW_VERSION"

echo "Done! Version bumped to $NEW_VERSION and pushed to remote."


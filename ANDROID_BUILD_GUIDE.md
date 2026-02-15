# Building Android APK with Tauri

## Prerequisites

### 1. Install Android Studio
Download and install Android Studio from: https://developer.android.com/studio

### 2. Install Required Android Components
Open Android Studio and install:
- Android SDK (API level 33 or higher recommended)
- Android NDK (version 25 or higher)
- Android SDK Build-Tools
- Android SDK Platform-Tools

### 3. Set Environment Variables
Add these to your `~/.bashrc` or `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -n 1)"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

Then reload your shell:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

### 4. Install Rust Android Targets
```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## Building the APK

### Step 1: Initialize Android in Tauri
From the project root directory:
```bash
npm install @tauri-apps/cli@latest
npm run tauri android init
```

This will create the Android project structure in `src-tauri/gen/android/`.

### Step 2: Build the APK
For development build:
```bash
npm run tauri android build
```

For release build (signed APK):
```bash
npm run tauri android build -- --release
```

### Step 3: Find Your APK
The APK will be located at:
- Debug: `src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk`

## Alternative: Build AAB (Android App Bundle)
For Google Play Store submission:
```bash
npm run tauri android build -- --aab
```

The AAB will be at: `src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab`

## Running on Device/Emulator

### Run in development mode:
```bash
npm run tauri android dev
```

### Install APK on connected device:
```bash
adb install src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk
```

## Troubleshooting

### If you get "ANDROID_HOME not set" error:
Make sure environment variables are set correctly and shell is reloaded.

### If you get NDK errors:
Ensure NDK is installed via Android Studio SDK Manager.

### If Rust targets are missing:
Run the rustup command from step 4 in prerequisites.

### Gradle build fails:
Try cleaning the build:
```bash
cd src-tauri/gen/android
./gradlew clean
cd ../../..
npm run tauri android build
```

## Signing Your APK for Release

For production releases, you'll need to sign your APK. Create a keystore:
```bash
keytool -genkey -v -keystore ~/subspace-release-key.keystore -alias subspace -keyalg RSA -keysize 2048 -validity 10000
```

Then configure signing in `src-tauri/gen/android/app/build.gradle.kts` after initialization.

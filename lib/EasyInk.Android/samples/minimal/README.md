# EasyInk Android Minimal Sample

This sample app opens a tiny Android UI with two actions:

- Render PDF
- Render Images

It depends on the local EasyInk Android SDK module in this repository.

## Open In Android Studio

Open this directory as the Android Studio project:

```text
lib/EasyInk.Android
```

Then choose the `sample-minimal` run configuration and run it on an emulator or device.

Rendered files are published to the system Downloads collection:

```text
Download/EasyInk
```

## Command Line Build

From the repository root:

```bash
node ./scripts/android-render-sdk-build.mjs
```

From this Android project directory:

```bash
./.gradle/android-render-sdk/gradle-9.5.1/bin/gradle --no-daemon :sample-minimal:assembleDebug
```

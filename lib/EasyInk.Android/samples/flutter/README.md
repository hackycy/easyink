# EasyInk Flutter Sample

This sample exercises the Android SDK through the local `easyink_android`
Flutter plugin.
It renders both a minimal HTML document and the bundled supermarket Schema/Data
fixture to PNG files.

The project uses Flutter 3.38 or newer because the current AAR is compiled with
Kotlin 2.2 metadata. Older Flutter Android templates need to be upgraded before
they can compile this sample's Kotlin bridge.

## Run

Build the AAR and repository-local Maven publication first from the repository
root:

```bash
pnpm android:render-sdk:build
```

Then run the Flutter app on an Android device or emulator:

```bash
cd lib/EasyInk.Android/samples/flutter
flutter pub get
flutter run
```

The plugin resolves `com.easyink:easyink-android-render:0.1.0` from the local
Maven repository generated at `lib/EasyInk.Android/build/repository`.
The sample Android root declares that repository in `android/build.gradle.kts`;
production hosts should replace it with the configured remote Maven repository.
The Flutter app manifest enables Internet access and the SDK loopback network
security resource. The sample uses a 120-second readiness timeout for diagnosis.

Use `Render HTML images` first. It tests the local HTML loading path without the
viewer Schema runtime. `Render Schema images` then tests Flutter asset loading,
MethodChannel string transport, and the embedded viewer runtime.

Successful images are published to the public `Download/EasyInk` directory. On
Android 10 and newer the sample uses MediaStore; Android 9 and older request the
legacy storage permission before rendering.

For focused logs:

```bash
adb logcat -s EasyInkAndroidPlugin chromium cr_AwContents
```

The Android side logs only request sizes and the WebView package version; it does
not print the full Schema or Data payload.

## Older System WebView

The Schema path executes the viewer JavaScript embedded in the Android AAR. The
runtime avoids logical assignment syntax such as `||=` so it can be parsed by
older System WebView versions. If readiness still times out, inspect the WebView
console before increasing the timeout: a parse error prevents
`window.easyinkReady` from ever being set.

## Structure

- `lib/` contains only sample UI and calls the typed plugin API.
- `plugins/easyink_android/lib/` owns the public Dart API.
- `plugins/easyink_android/android/` owns MethodChannel, Activity permissions,
  EasyInk SDK calls, task cleanup, and Downloads publishing.
- `MainActivity` is intentionally empty so plugin auto-registration is covered.

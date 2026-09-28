# easyink_android

Local Flutter plugin used by the EasyInk Android Flutter sample. It provides a
typed Dart API over the native EasyInk AAR and publishes rendered PNG files to
the public `Download/EasyInk` directory.

The plugin is intentionally Android-only and resolves
`com.easyink:easyink-android-render:0.1.0` from the repository-local Maven
repository generated under `lib/EasyInk.Android/build/repository`.

```dart
final renderer = EasyInkAndroid();
final files = await renderer.renderSchemaImages(
  schemaJson: schemaJson,
  dataJson: dataJson,
);
```

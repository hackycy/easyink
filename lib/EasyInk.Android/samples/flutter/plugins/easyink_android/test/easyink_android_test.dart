import 'package:easyink_android/easyink_android.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.easyink.android/renderer');
  late MethodCall call;
  late EasyInkAndroid renderer;

  setUp(() {
    renderer = EasyInkAndroid(channel: channel);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (methodCall) async {
          call = methodCall;
          return <String>['Download/EasyInk/page-001.png'];
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('sends schema render arguments and returns published paths', () async {
    final files = await renderer.renderSchemaImages(
      schemaJson: '{"page":{"width":80,"height":120}}',
      dataJson: '{}',
      scale: 2,
      timeout: const Duration(seconds: 30),
    );

    expect(call.method, 'renderImages');
    expect(call.arguments, containsPair('sourceType', 'schema'));
    expect(call.arguments, containsPair('scale', 2.0));
    expect(call.arguments, containsPair('timeoutMs', 30000));
    expect(files, ['Download/EasyInk/page-001.png']);
  });

  test('validates HTML before invoking the platform', () async {
    expect(() => renderer.renderHtmlImages(html: '  '), throwsArgumentError);
  });
}

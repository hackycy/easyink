import 'package:flutter/services.dart';

class EasyInkAndroid {
  EasyInkAndroid({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel(_channelName);

  static const _channelName = 'com.easyink.android/renderer';

  final MethodChannel _channel;

  Future<List<String>> renderHtmlImages({
    required String html,
    double paperWidthMm = 80,
    double paperHeightMm = 120,
    double scale = 1,
    Duration timeout = const Duration(seconds: 120),
  }) {
    if (html.trim().isEmpty) {
      throw ArgumentError.value(html, 'html', 'must not be empty');
    }
    if (paperWidthMm <= 0 || paperHeightMm <= 0) {
      throw ArgumentError('Paper dimensions must be greater than zero.');
    }
    return _renderImages({
      'sourceType': 'html',
      'html': html,
      'paperWidthMm': paperWidthMm,
      'paperHeightMm': paperHeightMm,
      'scale': _validateScale(scale),
      'timeoutMs': _validateTimeout(timeout),
    });
  }

  Future<List<String>> renderSchemaImages({
    required String schemaJson,
    required String dataJson,
    double scale = 1,
    Duration timeout = const Duration(seconds: 120),
  }) {
    if (schemaJson.trim().isEmpty) {
      throw ArgumentError.value(schemaJson, 'schemaJson', 'must not be empty');
    }
    if (dataJson.trim().isEmpty) {
      throw ArgumentError.value(dataJson, 'dataJson', 'must not be empty');
    }
    return _renderImages({
      'sourceType': 'schema',
      'schemaJson': schemaJson,
      'dataJson': dataJson,
      'scale': _validateScale(scale),
      'timeoutMs': _validateTimeout(timeout),
    });
  }

  Future<List<String>> _renderImages(Map<String, Object> arguments) async {
    final result = await _channel.invokeMethod<List<dynamic>>(
      'renderImages',
      arguments,
    );
    return List.unmodifiable((result ?? const <dynamic>[]).cast<String>());
  }

  double _validateScale(double scale) {
    if (!scale.isFinite || scale <= 0) {
      throw ArgumentError.value(scale, 'scale', 'must be greater than zero');
    }
    return scale;
  }

  int _validateTimeout(Duration timeout) {
    if (timeout <= Duration.zero) {
      throw ArgumentError.value(
        timeout,
        'timeout',
        'must be greater than zero',
      );
    }
    return timeout.inMilliseconds;
  }
}

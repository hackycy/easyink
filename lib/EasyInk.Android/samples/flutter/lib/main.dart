import 'package:easyink_android/easyink_android.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show PlatformException, rootBundle;

void main() {
  runApp(const EasyInkSampleApp());
}

class EasyInkSampleApp extends StatelessWidget {
  const EasyInkSampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EasyInk Flutter sample',
      theme: ThemeData(primarySwatch: Colors.blue),
      home: const EasyInkSamplePage(),
    );
  }
}

class EasyInkSamplePage extends StatefulWidget {
  const EasyInkSamplePage({super.key});

  @override
  State<EasyInkSamplePage> createState() => _EasyInkSamplePageState();
}

class _EasyInkSamplePageState extends State<EasyInkSamplePage> {
  final _renderer = EasyInkAndroid();

  String _status = 'Ready';
  bool _busy = false;

  Future<void> _render(String mode) async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _status = 'Rendering $mode...';
    });

    try {
      final files = mode == 'html'
          ? await _renderer.renderHtmlImages(
              html:
                  '<div style="width:80mm;height:120mm;padding:8mm;box-sizing:border-box;font-size:20px">Flutter EasyInk test</div>',
            )
          : await _renderer.renderSchemaImages(
              schemaJson: await rootBundle.loadString(
                'assets/supermarket-receipt.schema.json',
              ),
              dataJson: await rootBundle.loadString(
                'assets/supermarket-receipt.data.json',
              ),
            );
      if (!mounted) return;
      setState(() {
        _status = 'Success\n${files.join('\n')}';
      });
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() {
        _status = 'Failed\n${error.code}: ${error.message}';
      });
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EasyInk Flutter sample')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton(
              onPressed: _busy ? null : () => _render('html'),
              child: const Text('Render HTML images'),
            ),
            ElevatedButton(
              onPressed: _busy ? null : () => _render('schema'),
              child: const Text('Render Schema images'),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: SingleChildScrollView(
                child: SelectableText(_status),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

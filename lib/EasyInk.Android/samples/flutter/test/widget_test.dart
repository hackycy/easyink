import 'package:flutter_test/flutter_test.dart';

import 'package:easyink_flutter_sample/main.dart';

void main() {
  testWidgets('shows render actions', (WidgetTester tester) async {
    await tester.pumpWidget(const EasyInkSampleApp());

    expect(find.text('Render HTML images'), findsOneWidget);
    expect(find.text('Render Schema images'), findsOneWidget);
  });
}

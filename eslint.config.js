// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    vue: true,
    pnpm: false,
    ignores: ['.github/**/*.md', 'docs/**/*.md', '**/bin/**', '**/obj/**', 'lib/EasyInk.Render/host/internal/easyink/runtime/easyink-viewer/assets/vendor/**'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  },
  {
    files: ['packages/designer/src/{components,composables,interactions}/**/*.{ts,vue}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name=/^(unitManager|um)$/][callee.property.name=/^(screenToDocument|documentToScreen)$/]',
          message: 'Use GeometryService for screen/document coordinate conversion in designer interactions.',
        },
      ],
    },
  },
)

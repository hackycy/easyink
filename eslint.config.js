// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    vue: true,
    pnpm: false,
    ignores: ['.github/**/*.md', 'docs/**/*.md', '**/bin/**', '**/obj/**', '**/.dart_tool/**', 'lib/**'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  },
)

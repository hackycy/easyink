// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    ignores: ['ARCHITECTURE.md'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  },
)

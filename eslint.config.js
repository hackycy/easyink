// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    vue: true,
    ignores: ['.github/architecture/*.md'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  },
)

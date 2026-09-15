import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 구조분해로 필드를 덜어낼 때 쓰는 _ 접두사 변수는 의도적으로 안 쓴다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // api/ 는 Vercel 의 Node 빌더가 파일별로 변환해 그대로 Node 에 올린다.
    // 상대 import 에 .ts 를 쓰면 타입 검사는 통과하지만 런타임에서
    // ERR_MODULE_NOT_FOUND 로 함수가 로드조차 되지 않는다(실제로 겪었다).
    // 변환 후 파일명과 일치하는 .js 를 써야 한다.
    files: ['api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.{1,2}/.*\\.ts$',
              message: "api/ 안의 상대 import 는 .ts 가 아니라 .js 확장자를 써야 합니다. Vercel 런타임이 .ts 를 찾지 못해 함수가 죽습니다.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  }
)

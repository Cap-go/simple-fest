import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'website', 'android', 'ios', 'node_modules', 'worker/src/worker-configuration.d.ts']),
  {
    files: ['**/*.{ts,vue}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, pluginVue.configs['flat/recommended']],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
    rules: {
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      // Ionic web components use native slot attributes.
      'vue/no-deprecated-slot-attribute': 'off',
    },
  },
])

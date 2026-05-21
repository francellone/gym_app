import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default [
  // Ignorar carpetas y archivos no relevantes
  {
    ignores: [
      'dist/**',
      'dist-verify/**',
      'dist-claude-verify/**',
      'node_modules/**',
      'public/sw.js',
      'vite.config.js.timestamp-*.mjs',
      'supabase/**',
      'diagnostico_arquitec/**',
      'Aplicación para Gimnasio y entrenamiento/**',
    ],
  },

  // Recomendado de ESLint
  js.configs.recommended,

  // Reglas para todo el código del front
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React básico
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,

      // React Hooks — clásicas como ERROR
      'react-hooks/rules-of-hooks': 'error',

      // React Hooks v7 nuevas reglas — como WARN para no bloquear commits del código heredado
      // (son sugerencias legítimas, pero refactorizar 30+ sitios es trabajo aparte; ver Tier 2.3)
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',

      // Tolerancias para JS sin TS
      'react/prop-types': 'off', // sin TS, propTypes es ruido
      'react/no-unescaped-entities': 'off', // tipear ' " < > en texto JSX no es bug
      'react/display-name': 'off',

      // Vite + Fast Refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Buen olfato pero no estricto
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'off', // hay 2 console.log en src/, no es crítico
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Edge functions (Deno) — usan globals distintos
  {
    files: ['supabase/functions/**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Deno: 'readonly',
      },
    },
  },

  // Prettier al final para apagar reglas que chocan con formato
  prettier,
]

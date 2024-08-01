import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends("eslint:recommended"), {
    extends: ["eslint:recommended"],
    languageOptions: {
        globals: {
            ...globals.node,
            ...globals.mocha,
        },

        ecmaVersion: 2023,
        sourceType: "commonjs",
    },

    rules: {
        indent: ['error', 4, {
            SwitchCase: 1,
        }],

        'no-console': 'off',
        'no-var': 'error',
        'no-trailing-spaces': 'error',
        'prefer-const': 'error',

        quotes: ['error', 'single', {
            avoidEscape: true,
            allowTemplateLiterals: true,
        }],

        semi: ['error', 'always'],
        'comma-dangle': ['error', 'always-multiline'],
    },
}];
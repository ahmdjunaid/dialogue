import globals from "globals";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {languageOptions: { globals: globals.node },
  rules: {
    'no-unused-vars' : 'warn',
    // 'quotes' : ['warn','single'],
    // 'semi' : ['warn','always'],
  }
},
];
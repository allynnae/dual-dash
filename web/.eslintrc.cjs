module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: ["eslint:recommended", "plugin:react-hooks/recommended"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "detect" } },
  ignorePatterns: ["dist"],
  rules: {
    "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
    "no-undef": "off"
  }
};

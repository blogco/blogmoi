import globals from "globals";

export default [{
  files: ["static/js/**/*.js"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.browser },
  rules: { "no-undef": "error", "no-unreachable": "error", "no-dupe-args": "error", "no-dupe-keys": "error", "valid-typeof": "error" },
}];

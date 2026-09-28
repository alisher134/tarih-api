/** @type {import("lint-staged").Configuration} */
const config = {
  "*.ts": ["eslint --fix", "prettier --write"],
  "*.{js,mjs,cjs,json,md}": "prettier --write",
};

export default config;

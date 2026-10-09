// Expo detecta o monorepo (pnpm workspaces) automaticamente; os pacotes
// @rebania/* exportam TypeScript fonte e são transpilados pelo Metro.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);

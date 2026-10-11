// TypeScript 7 ships no JavaScript compiler API, but Stryker's core rewrites
// tsconfig.json with it and its checker type-checks mutants with it. Give both
// the last 6.x release, instead of the project's TypeScript 7 that they would
// otherwise reach through the typescript peer or the root node_modules.
const STRYKER_TYPESCRIPT = "6.0.3";

function readPackage(pkg) {
  if (
    pkg.name === "@stryker-mutator/core" ||
    pkg.name === "@stryker-mutator/typescript-checker"
  ) {
    delete pkg.peerDependencies?.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: STRYKER_TYPESCRIPT };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };

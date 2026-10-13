// Architecture rules (ADR 0012, 0046, 0055, 0065), checked by `pnpm lint:deps`.
const LAYER = "(?:domain|application|infrastructure)";
const KINDS = "^src/domain/vehicle/kinds/";

module.exports = {
  forbidden: [
    {
      name: "domain-imports-outer-layer",
      comment:
        "The domain imports neither application, infrastructure, nor @minecraft/ (ADR 0012).",
      severity: "error",
      from: { path: "^src/domain/" },
      to: {
        path: ["^src/(?:application|infrastructure)/", "(?:^|/)@minecraft/"],
      },
    },
    {
      name: "application-imports-infrastructure",
      comment:
        "The application imports neither infrastructure nor @minecraft/ (ADR 0012).",
      severity: "error",
      from: { path: "^src/application/" },
      to: { path: ["^src/infrastructure/", "(?:^|/)@minecraft/"] },
    },
    {
      name: "main-imports-only-bootstrap",
      comment: "src/main.ts only calls bootstrap() (ADR 0012).",
      severity: "error",
      from: { path: "^src/main\\.ts$" },
      to: { pathNot: "^src/infrastructure/bootstrap\\.ts$" },
    },
    {
      name: "feature-imports-other-feature",
      comment:
        "A feature imports only itself and shared/; shared/ imports no feature (ADR 0046).",
      severity: "error",
      from: { path: `^src/${LAYER}/([^/]+)/` },
      to: {
        path: `^src/${LAYER}/[^/]+/`,
        pathNot: `^src/${LAYER}/(?:$1|shared)/`,
      },
    },
    {
      name: "kind-imports-other-kind",
      comment:
        "One kind never imports another; kinds/index.ts wires them all (ADR 0055).",
      severity: "error",
      from: { path: `${KINDS}([^/]+)/` },
      to: { path: KINDS, pathNot: `${KINDS}$1/` },
    },
    {
      name: "core-imports-kind",
      comment: "The core and motion/ never import kinds/ (ADR 0055).",
      severity: "error",
      from: { path: "^src/domain/vehicle/", pathNot: KINDS },
      to: { path: KINDS },
    },
    {
      name: "core-imports-motion",
      comment: "The core never imports motion/ (ADR 0055).",
      severity: "error",
      from: { path: "^src/domain/vehicle/[^/]+$" },
      to: { path: "^src/domain/vehicle/motion/" },
    },
    {
      name: "outer-layer-imports-kind",
      comment:
        "Application and infrastructure reach kinds/ only through kinds/index.ts (ADR 0055).",
      severity: "error",
      from: { path: "^src/(?:application|infrastructure)/" },
      to: { path: KINDS, pathNot: `${KINDS}index\\.ts$` },
    },
    {
      name: "kind-names-import-nothing",
      comment: "kind.ts imports nothing, not even a package (ADR 0055).",
      severity: "error",
      from: { path: "^src/domain/vehicle/kind\\.ts$" },
      to: {},
    },
    {
      name: "not-resolvable",
      comment:
        "An import that does not resolve would slip past every rule above.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    // typescript 7 has no JS API, so dependency-cruiser parses .ts with swc (ADR 0065).
    parser: "swc",
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^src/test-pack/" },
  },
};

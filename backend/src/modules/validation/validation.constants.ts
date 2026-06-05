// Shared, prisma-free validation constants.
//
// The canonical home for these moved to ../findings/finding-classifier.ts (the
// shared finding taxonomy base). Re-exported here for back-compat so
// validation.engine.ts keeps importing PROJECT_LEVEL_PREFIX from this module.
export { CODE_SEPARATOR, PROJECT_LEVEL_PREFIX } from "../findings/finding-classifier.js";

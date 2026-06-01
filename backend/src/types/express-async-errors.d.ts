// `express-async-errors` is a side-effect-only module (it monkey-patches
// Express's router layer to forward rejected async-handler promises to
// `next(err)`). It ships no type declarations, so we declare the module here.
declare module "express-async-errors";

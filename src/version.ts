import pkg from '../package.json' with { type: 'json' };

/** Inlined into the bundle at build time, so the server never reads package.json at runtime. */
export const VERSION: string = pkg.version;

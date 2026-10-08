import pkg from "../package.json" with { type: "json" };

/**
 * Canonical application version sourced directly from desktop package metadata.
 */
export const APP_VERSION: string = pkg.version;
export const APP_VERSION_LABEL: string = `v${pkg.version}`;

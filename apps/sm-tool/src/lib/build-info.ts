import rootPackage from "../../../../package.json";

type BuildImportMeta = ImportMeta & {
  readonly env?: {
    readonly VITE_BUILD_SHA?: string;
  };
};

export const APP_VERSION = rootPackage.version;
export const BUILD_IDENTIFIER =
  (import.meta as BuildImportMeta).env?.VITE_BUILD_SHA?.trim() || "local";
export const BUILD_MARKER_LABEL = `v${APP_VERSION} · build ${BUILD_IDENTIFIER}`;

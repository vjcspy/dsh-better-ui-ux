/**
 * Dynamic Web Client bundle for the model badge plugin.
 *
 * The DSH Client loads plugin bundles through the shell-owned module loader, so
 * the artifact must hand its factory to `window.__ModuleLoader__.load` instead of
 * exporting an ES module. `platform: 'browser'` + `format: 'cjs'` reproduce the
 * in-repo client-bundle preset, whose `require` answers from the preloaded
 * platform module table.
 *
 * React and its JSX runtime are declared as externals because the loader — not
 * this bundle — owns those instances; inlining a second copy would break hooks.
 * They are the ONLY rows this bundle requests: every other input of this plugin
 * is either a type-only import (erased before emit) or its own source, so no
 * `dsh.client.external` entry and no `dsh.client.inject` row exists. The
 * module-table baseline (`PLATFORM_MODULES` in
 * `packages/client/web/src/platform.ts`) is implicit for every dynamic bundle and
 * is stated here explicitly because this config is hand-rolled: the in-repo
 * preset derives it from `PLATFORM_MODULES`, which an external plugin cannot
 * import.
 *
 * The Host half is emitted by `tsc` (see `build:host`), which is why no `index`
 * entry appears here.
 */
import { defineConfig } from 'tsdown'

/** Package name; must equal the `id` the loader registers and `package.json` `name`. */
const PLUGIN_ID = 'dsh-better-ui-ux'

/** Specifiers left to the shell's preloaded module table. */
const EXTERNAL = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]

export default defineConfig({
  name: PLUGIN_ID,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: { neverBundle: EXTERNAL },
  // A browser bundle has no `process`, and a factory that reads it throws
  // `ReferenceError: process is not defined` at boot, which fails the whole
  // client half with a full-page "Failed to load plugins" rather than degrading
  // one surface. The in-repo client preset bakes the same substitution for the
  // same reason, and an external plugin cannot import that preset, so the define
  // is stated here. Artifacts default to production.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})

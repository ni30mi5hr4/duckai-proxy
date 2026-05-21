import { createRequire } from "node:module";
  import path from "node:path";
  import { fileURLToPath } from "node:url";
  import { build as esbuild } from "esbuild";
  import esbuildPluginPino from "esbuild-plugin-pino";
  import { rm } from "node:fs/promises";

  globalThis.require = createRequire(import.meta.url);
  const artifactDir = path.dirname(fileURLToPath(import.meta.url));

  async function buildAll() {
    const distDir = path.resolve(artifactDir, "dist");
    await rm(distDir, { recursive: true, force: true });

    await esbuild({
      entryPoints: [path.resolve(artifactDir, "src/index.ts")],
      platform: "node",
      bundle: true,
      format: "esm",
      outdir: distDir,
      outExtension: { ".js": ".mjs" },
      logLevel: "info",
      external: [
        "*.node",
        "jsdom",
        "sharp",
        "canvas",
        "bufferutil",
        "utf-8-validate",
      ],
      sourcemap: "linked",
      plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
      banner: {
        js: `import { createRequire as __cr } from 'node:module';
  import __path from 'node:path';
  import __url from 'node:url';
  globalThis.require = __cr(import.meta.url);
  globalThis.__filename = __url.fileURLToPath(import.meta.url);
  globalThis.__dirname = __path.dirname(globalThis.__filename);
  `,
      },
    });
  }

  buildAll().catch((err) => { console.error(err); process.exit(1); });
  
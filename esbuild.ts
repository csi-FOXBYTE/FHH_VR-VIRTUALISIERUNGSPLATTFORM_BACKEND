import { build } from "esbuild";
import glob from "tiny-glob";

export async function startDev() {
  const entryPoints = await glob("src/**/*.ts");

  await build({
    entryPoints,
    logLevel: "silent",
    outdir: ".dev",
    bundle: false,
    minify: false,
    platform: "node",
    splitting: true,
    treeShaking: true,
    format: "esm",
    sourcemap: 'inline',
  });
}

export async function startBuild() {
  const entryPoints = await glob("src/**/*.ts");

  await build({
    entryPoints,
    logLevel: "silent",
    outdir: ".build",
    bundle: false,
    minify: true,
    platform: "node",
    splitting: true,
    treeShaking: true,
    format: "esm",
    sourcemap: true,
  });
}

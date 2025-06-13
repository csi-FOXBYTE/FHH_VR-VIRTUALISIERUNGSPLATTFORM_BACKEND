import chokidar from "chokidar";
import startBuild from "./esbuild.js";

(async function () {
  const watcher = chokidar.watch("src", {
    persistent: true,
  });

  watcher.on("change", async () => {
    await startBuild();
  });
})();

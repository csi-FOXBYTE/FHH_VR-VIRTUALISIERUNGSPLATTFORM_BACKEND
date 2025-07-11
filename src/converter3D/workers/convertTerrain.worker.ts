import "dotenv";

import { generate, preprocess } from "@csi-foxbyte/mesh-dem-to-terrain";
import { JobProgress } from "bullmq";
import _ from "lodash";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { getBlockBlobClient } from "../../lib/BlockBlobClient.js";
import { injectPinoLogger } from "../../lib/pino.js";
import { ConvertTerrainJob } from "../jobs/convertTerrain.job.js";

injectPinoLogger();

export default async function run(
  job: ConvertTerrainJob
): Promise<ConvertTerrainJob["returnValue"]> {
  console.log("Converting Terrain...");

  const zipBlockBlobClient = await getBlockBlobClient(
    job.data.containerName,
    job.data.blobName
  );

  const rootPath = path.join(job.data.localProcessorFolder, job.data.blobName);

  try {
    const throttledProgress = _.throttle(async (progress: JobProgress) => {
      await job.updateProgress(progress);
    }, 1_000);

    const zipPath = path.join(rootPath, job.data.blobName);

    await mkdir(rootPath, { recursive: true });

    await zipBlockBlobClient.downloadToFile(zipPath);

    const preprocessedDir = path.join(rootPath, "preprocessed");

    await mkdir(preprocessedDir, { recursive: true });

    await preprocess(
      zipPath,
      preprocessedDir,
      (progress) => throttledProgress(progress * 0.5),
      job.data.srcSRS
    );

    await generate(
      preprocessedDir,
      (progress) => throttledProgress(progress * 0.5 + 0.5),
      {
        writeFile: async (_, file, terrainTile) => {
          if (terrainTile) {
            console.log({
              path: `${terrainTile.zoom}/${terrainTile.x}/${terrainTile.y}.terrain`,
              terrainTile,
            });
            const fileBlockBlobClient = await getBlockBlobClient(
              `terrain-${job.data.blobName}`,
              `${terrainTile.zoom}/${terrainTile.x}/${terrainTile.y}.terrain`
            );

            await fileBlockBlobClient.uploadData(Buffer.from(file));
            return;
          }

          const fileBlockBlobClient = await getBlockBlobClient(
            `terrain-${job.data.blobName}`,
            `layer.json`
          );

          await fileBlockBlobClient.uploadData(Buffer.from(file));
        },
      }
    );

    try {
      await zipBlockBlobClient.delete();
      await rm(rootPath, { force: true, recursive: true });
    } catch {}
  } catch (e) {
    console.error(e);
    try {
      await zipBlockBlobClient.delete();
      await rm(rootPath, { force: true, recursive: true });
    } catch {}
    throw e;
  }
}

import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import { getAppDownloadService } from "../@internals/index.js";

const appDownloadController = createController()
  .rootPath("/appDownload");

appDownloadController
  .addRoute("GET", "/link")
  .output(Type.String())
  .handler(async ({ services }) => {
    const appDownloadService = await getAppDownloadService(services);

    return await appDownloadService.getURL();
  });

export default appDownloadController;

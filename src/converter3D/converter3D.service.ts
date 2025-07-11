import { BlockBlobUploadStreamOptions } from "@azure/storage-blob";
import { ContextService, Service } from "@tganzhorn/fastify-modular";
import { Queue } from "bullmq";
import { Readable } from "node:stream";
import { AuthService } from "../auth/auth.service.js";
import { BlobStorageService } from "../blobStorage/blobStorage.service.js";
import { ConfigurationService } from "../configuration/configuration.service.js";
import { DbService } from "../db/db.service.js";
import {
  Convert3DTilesJob,
  Convert3DTilesQueueName,
} from "./jobs/convert3DTiles.job.js";
import {
  ConvertProjectModelJob,
  ConvertProjectModelQueueName,
} from "./jobs/convertProjectModel.job.js";
import {
  ConvertTerrainJob,
  ConvertTerrainQueueName,
} from "./jobs/convertTerrain.job.js";

@Service([
  BlobStorageService,
  DbService,
  AuthService,
  ConfigurationService,
  ContextService,
])
export class Converter3DService {
  readonly tile3DConverterQueue: Queue<
    Convert3DTilesJob["data"],
    Convert3DTilesJob["returnValue"]
  >;
  readonly projectModelConverterQueue: Queue<
    ConvertProjectModelJob["data"],
    ConvertProjectModelJob["returnValue"]
  >;
  readonly terrainConverterQueue: Queue<
    ConvertTerrainJob["data"],
    ConvertTerrainJob["returnValue"]
  >;

  constructor(
    private blobStorageService: BlobStorageService,
    private dbService: DbService,
    private authService: AuthService,
    private configurationService: ConfigurationService,
    private contextService: ContextService
  ) {
    this.tile3DConverterQueue = this.contextService.ctx.queues.get(
      Convert3DTilesQueueName
    ) as Queue<Convert3DTilesJob["data"], Convert3DTilesJob["returnValue"]>;

    this.projectModelConverterQueue = this.contextService.ctx.queues.get(
      ConvertProjectModelQueueName
    ) as Queue<
      ConvertProjectModelJob["data"],
      ConvertProjectModelJob["returnValue"]
    >;
    this.terrainConverterQueue = this.contextService.ctx.queues.get(
      ConvertTerrainQueueName
    ) as Queue<ConvertTerrainJob["data"], ConvertTerrainJob["returnValue"]>;
  }

  // #region project model
  private readonly projectModelUploadContainerName =
    "converter-project-model-upload";

  async uploadProjectModel(file: Readable, fileName: string, srcSRS: string) {
    const { blobName } = await this.blobStorageService.uploadStream(
      file,
      this.projectModelUploadContainerName
    );

    const job = await this.projectModelConverterQueue.add(blobName, {
      blobName,
      fileName,
      srcSRS,
      containerName: this.projectModelUploadContainerName,
      secret: crypto.randomUUID(),
    });

    await this.blobStorageService.deleteLater(
      this.projectModelUploadContainerName,
      blobName,
      24 * 60 * 60 * 1000
    );

    return { jobId: job.id!, secret: job.data.secret };
  }

  async deleteProjectModelRemnants(blobName: string) {
    try {
      await this.blobStorageService.delete(
        this.projectModelUploadContainerName,
        blobName
      );
    } catch (e) {
      console.error(e);
    }
  }

  async getProjectModelStatus(jobId: string, secret: string) {
    const job = await this.projectModelConverterQueue.getJob(jobId);

    if (!job || job.data.secret !== secret)
      throw new Error(`There is no job with id ${jobId}!`);

    const state = await job.getState();

    if (state === "failed") throw new Error("Failed");

    if (state === "completed") {
      const { modelMatrix } = job.returnvalue;

      return {
        state,
        progress: Number(job.progress),
        modelMatrix,
      };
    }

    return { state, progress: Number(job.progress) };
  }

  async downloadProjectModel(jobId: string, secret: string) {
    const job = await this.projectModelConverterQueue.getJob(jobId);

    if (!job || job.data.secret !== secret)
      throw new Error(`There is no job with id ${jobId}!`);

    const { collectableBlobName } = job.returnvalue;

    return await this.blobStorageService.downloadToBuffer(
      this.projectModelUploadContainerName,
      collectableBlobName
    );
  }

  // #endregion

  // #region terrain
  private readonly terrainUploadContainerName = "converter-terrain-upload";

  async uploadTerrain(
    stream: Readable,
    name: string,
    srcSRS: string,
    onProgress?: BlockBlobUploadStreamOptions["onProgress"]
  ) {
    const { id } = await this.dbService.subscriberClient.baseLayer.create({
      data: {
        name: name,
        sizeGB: 0,
        type: "TERRAIN",
        status: "PENDING",
        progress: 0,
        ownerId: (await this.authService.getSession())!.user.id,
      },
      select: {
        id: true,
      },
    });

    await this.blobStorageService.uploadStream(
      stream,
      this.terrainUploadContainerName,
      id,
      onProgress
    );

    const job = await this.terrainConverterQueue.add(id, {
      blobName: id,
      srcSRS,
      containerName: this.terrainUploadContainerName,
      localProcessorFolder: (
        await this.configurationService.getConfiguration()
      ).localProcessorFolder,
    });

    return { jobId: job.id! };
  }

  async getTerrainStatus(jobId: string) {
    const job = await this.terrainConverterQueue.getJob(jobId);

    if (!job) throw new Error(`There is no job with id ${jobId}!`);

    const state = await job.getState();

    if (state === "failed") throw new Error("Failed");

    return { state, progress: job.progress };
  }
  // #endregion

  //#region 3d tile
  private readonly tile3DUploadContainerName = "converter-tile-3d-upload";

  async upload3DTile(
    stream: Readable,
    name: string,
    srcSRS: string,
    onProgress?: BlockBlobUploadStreamOptions["onProgress"]
  ) {
    const { id } = await this.dbService.subscriberClient.baseLayer.create({
      data: {
        name: name,
        sizeGB: 0,
        type: "3D-TILES",
        status: "PENDING",
        progress: 0,
        ownerId: (await this.authService.getSession())!.user.id,
      },
      select: {
        id: true,
      },
    });

    await this.blobStorageService.uploadStream(
      stream,
      this.tile3DUploadContainerName,
      id,
      onProgress
    );

    const job = await this.tile3DConverterQueue.add(id, {
      blobName: id,
      srcSRS,
      containerName: this.tile3DUploadContainerName,
      localProcessorFolder: (
        await this.configurationService.getConfiguration()
      ).localProcessorFolder,
    });

    return { jobId: job.id! };
  }

  async get3DTileStatus(jobId: string) {
    const job = await this.tile3DConverterQueue.getJob(jobId);

    if (!job) throw new Error(`There is no job with id ${jobId}!`);

    const state = await job.getState();

    if (state === "failed") throw new Error("Failed");

    return { state, progress: job.progress };
  }
  // #endregion

  async updateBaseLayerStatus(
    id: string,
    progress: number,
    status: "PENDING" | "ACTIVE" | "FAILED" | "COMPLETED"
  ) {
    return await this.dbService.subscriberClient.baseLayer.update({
      where: {
        id,
      },
      data: {
        progress,
        status,
      },
    });
  }
}

import { Controller, Job, Worker } from "@tganzhorn/fastify-modular";
import {
  DeleteBlobJob,
  DeleteBlobJobQueueName,
} from "./jobs/deleteBlob.job.js";
import { BlobStorageService } from "./blobStorage.service.js";

@Controller("/blobStorage", [BlobStorageService])
export class BlobStorageController {
  constructor(private blobStorageService: BlobStorageService) {}

  @Worker(DeleteBlobJobQueueName, undefined, {
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 100 },
  })
  async deleteBlob(@Job() job: DeleteBlobJob) {
    await this.blobStorageService.delete(
      job.data.containerName,
      job.data.blobName
    );
  }
}

import { Job } from "bullmq";

export const DeleteBlobJobQueueName = "converter3D.convert-3d-tile";

export type DeleteBlobJob = Job<
  { containerName: string; blobName: string },
  void
>;

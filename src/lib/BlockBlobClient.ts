import "dotenv";
import { BlobServiceClient } from "@azure/storage-blob";

let _blobServiceClient: BlobServiceClient | null = null;

export async function getBlockBlobClient(
  containerName: string,
  blobName: string
) {
  if (!_blobServiceClient) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (!connectionString) {
      throw Error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env");
    }

    _blobServiceClient = BlobServiceClient.fromConnectionString(
      connectionString,
      {}
    );
  }

  const containerClient = _blobServiceClient.getContainerClient(containerName);

  await containerClient.createIfNotExists();

  return containerClient.getBlockBlobClient(blobName);
}

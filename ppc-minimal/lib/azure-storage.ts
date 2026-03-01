import { BlobServiceClient } from '@azure/storage-blob';

function getClient() {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set');
  return BlobServiceClient.fromConnectionString(connStr);
}

function getContainer() {
  const name = process.env.AZURE_STORAGE_CONTAINER_NAME || 'project-plans';
  return getClient().getContainerClient(name);
}

export async function uploadFile(path: string, buffer: Buffer, contentType?: string): Promise<string> {
  const container = getContainer();
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(path);
  await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' } });
  return path;
}

export async function downloadFile(path: string): Promise<{ data: Buffer; contentType: string }> {
  const container = getContainer();
  const blob = container.getBlockBlobClient(path);
  const dl = await blob.downloadToBuffer();
  const props = await blob.getProperties();
  return { data: dl, contentType: props.contentType || 'application/octet-stream' };
}

export function isAzureConfigured(): boolean {
  return !!process.env.AZURE_STORAGE_CONNECTION_STRING;
}

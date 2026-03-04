import { BlobServiceClient } from '@azure/storage-blob';

function normalizeEnv(val: string | undefined): string {
  if (!val) return '';
  const trimmed = val.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.replace(/\r?\n/g, '').trim();
}

function getClient() {
  const connStr = normalizeEnv(process.env.AZURE_STORAGE_CONNECTION_STRING);
  if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set');
  try {
    if (connStr.startsWith('http://') || connStr.startsWith('https://')) {
      return new BlobServiceClient(connStr);
    }
    return BlobServiceClient.fromConnectionString(connStr);
  } catch {
    throw new Error(
      'Invalid AZURE_STORAGE_CONNECTION_STRING. Provide a full Azure Blob connection string or a valid Blob service URL/SAS.',
    );
  }
}

function getContainer() {
  const name = normalizeEnv(process.env.AZURE_STORAGE_CONTAINER_NAME) || 'project-plans';
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

export async function deleteFile(path: string): Promise<boolean> {
  const container = getContainer();
  const blob = container.getBlockBlobClient(path);
  const res = await blob.deleteIfExists();
  return res.succeeded;
}

export function isAzureConfigured(): boolean {
  return !!normalizeEnv(process.env.AZURE_STORAGE_CONNECTION_STRING);
}

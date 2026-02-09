/**
 * @fileoverview Azure Blob Storage Utility
 *
 * Provides upload, download, list, and delete operations for
 * the 'project-documents' container on Azure Blob Storage.
 * Server-side only (uses connection string).
 *
 * @module lib/azure-storage
 */

import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING || '';

const CONTAINER_NAME = 'project-documents';

let containerClient: ContainerClient | null = null;

/**
 * Check if Azure Blob Storage is configured
 */
export function isAzureStorageConfigured(): boolean {
  return Boolean(AZURE_STORAGE_CONNECTION_STRING);
}

/**
 * Get the container client (lazy singleton).
 * Creates the container if it doesn't exist.
 */
export async function getContainerClient(): Promise<ContainerClient | null> {
  if (!AZURE_STORAGE_CONNECTION_STRING) return null;

  if (!containerClient) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONNECTION_STRING
    );
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // Create container if it doesn't exist
    await containerClient.createIfNotExists({
      access: undefined, // private access
    });
  }

  return containerClient;
}

/**
 * Upload a file to Azure Blob Storage
 */
export async function uploadFile(
  path: string,
  data: Buffer | ArrayBuffer | Blob | ReadableStream,
  contentType?: string
): Promise<{ success: boolean; path: string; error?: string }> {
  try {
    const client = await getContainerClient();
    if (!client) {
      return { success: false, path, error: 'Azure Storage not configured' };
    }

    const blockBlobClient = client.getBlockBlobClient(path);

    let uploadData: Buffer;
    if (data instanceof Buffer) {
      uploadData = data;
    } else if (data instanceof ArrayBuffer) {
      uploadData = Buffer.from(data);
    } else if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      uploadData = Buffer.from(arrayBuffer);
    } else {
      // ReadableStream - collect chunks
      const reader = (data as ReadableStream).getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) chunks.push(result.value);
      }
      uploadData = Buffer.concat(chunks);
    }

    await blockBlobClient.uploadData(uploadData, {
      blobHTTPHeaders: {
        blobContentType: contentType || 'application/octet-stream',
        blobCacheControl: 'max-age=3600',
      },
    });

    return { success: true, path };
  } catch (err: any) {
    console.error('[AzureStorage] Upload error:', err.message);
    return { success: false, path, error: err.message };
  }
}

/**
 * Download a file from Azure Blob Storage
 */
export async function downloadFile(
  path: string
): Promise<{ data: Buffer | null; contentType: string; error?: string }> {
  try {
    const client = await getContainerClient();
    if (!client) {
      return { data: null, contentType: '', error: 'Azure Storage not configured' };
    }

    const blockBlobClient = client.getBlockBlobClient(path);
    const response = await blockBlobClient.download(0);

    if (!response.readableStreamBody) {
      return { data: null, contentType: '', error: 'No data returned' };
    }

    // Collect stream into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      data: Buffer.concat(chunks),
      contentType: response.contentType || 'application/octet-stream',
    };
  } catch (err: any) {
    console.error('[AzureStorage] Download error:', err.message);
    return { data: null, contentType: '', error: err.message };
  }
}

/**
 * List files in a folder within the container
 */
export async function listFiles(
  prefix: string,
  limit: number = 100
): Promise<{
  files: Array<{
    name: string;
    size: number;
    lastModified: Date | undefined;
    contentType: string;
  }>;
  error?: string;
}> {
  try {
    const client = await getContainerClient();
    if (!client) {
      return { files: [], error: 'Azure Storage not configured' };
    }

    const files: Array<{
      name: string;
      size: number;
      lastModified: Date | undefined;
      contentType: string;
    }> = [];

    let count = 0;
    for await (const blob of client.listBlobsFlat({ prefix })) {
      if (count >= limit) break;
      files.push({
        name: blob.name,
        size: blob.properties.contentLength || 0,
        lastModified: blob.properties.lastModified,
        contentType: blob.properties.contentType || 'application/octet-stream',
      });
      count++;
    }

    // Sort by last modified descending
    files.sort((a, b) => {
      const aTime = a.lastModified?.getTime() || 0;
      const bTime = b.lastModified?.getTime() || 0;
      return bTime - aTime;
    });

    return { files };
  } catch (err: any) {
    console.error('[AzureStorage] List error:', err.message);
    return { files: [], error: err.message };
  }
}

/**
 * Delete a file from Azure Blob Storage
 */
export async function deleteFile(
  path: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getContainerClient();
    if (!client) {
      return { success: false, error: 'Azure Storage not configured' };
    }

    const blockBlobClient = client.getBlockBlobClient(path);
    await blockBlobClient.deleteIfExists();

    return { success: true };
  } catch (err: any) {
    console.error('[AzureStorage] Delete error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Delete multiple files from Azure Blob Storage
 */
export async function deleteFiles(
  paths: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getContainerClient();
    if (!client) {
      return { success: false, error: 'Azure Storage not configured' };
    }

    for (const path of paths) {
      const blockBlobClient = client.getBlockBlobClient(path);
      await blockBlobClient.deleteIfExists();
    }

    return { success: true };
  } catch (err: any) {
    console.error('[AzureStorage] Batch delete error:', err.message);
    return { success: false, error: err.message };
  }
}

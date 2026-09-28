type MultipartPrepared = {
  strategy: "multipart";
  key: string;
  uploadId: string;
  partSize: number;
};

type SinglePrepared = { strategy?: "single"; url: string };

export class R2UploadError extends Error {
  constructor(
    message: string,
    public readonly detail: { stage: string; status: number | null; code?: string },
  ) {
    super(message);
  }
}

function r2UploadError(request: XMLHttpRequest, stage: string) {
  const status = request.status || null;
  const body = request.responseText?.slice(0, 300).replace(/<[^>]+>/g, " ").trim();
  const message = status
    ? `Upload R2 falhou na etapa ${stage} (HTTP ${status})${body ? `: ${body}` : ""}.`
    : `Upload R2 não recebeu resposta na etapa ${stage}. Verifique conexão ou CORS.`;
  return new R2UploadError(message, { stage, status, code: status ? undefined : "NETWORK_OR_CORS" });
}

export async function uploadToPresignedR2Url({
  url,
  file,
  contentType,
  onProgress,
  attempts = 3,
}: {
  url: string;
  file: File;
  contentType: string;
  onProgress?: (percent: number) => void;
  attempts?: number;
}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", url);
        request.setRequestHeader("Content-Type", contentType);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
        };
        request.onerror = () => reject(r2UploadError(request, "PUT direto"));
        request.onload = () => request.status >= 200 && request.status < 300
          ? resolve()
          : reject(r2UploadError(request, "PUT direto"));
        request.send(file);
      });
      onProgress?.(100);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => window.setTimeout(resolve, 700 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível enviar o arquivo.");
}

export async function uploadFileToR2({
  prepared,
  file,
  contentType,
  onProgress,
  getPartUrl,
  completeMultipart,
  abortMultipart,
}: {
  prepared: SinglePrepared | MultipartPrepared;
  file: File;
  contentType: string;
  onProgress?: (percent: number) => void;
  getPartUrl: (data: { key: string; uploadId: string; partNumber: number }) => Promise<{ url: string }>;
  completeMultipart: (data: { key: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }) => Promise<unknown>;
  abortMultipart: (data: { key: string; uploadId: string }) => Promise<unknown>;
}) {
  if (prepared.strategy !== "multipart") {
    return uploadToPresignedR2Url({ url: prepared.url, file, contentType, onProgress });
  }

  const parts: Array<{ partNumber: number; etag: string }> = [];
  const totalParts = Math.ceil(file.size / prepared.partSize);
  try {
    for (let index = 0; index < totalParts; index += 1) {
      const partNumber = index + 1;
      const start = index * prepared.partSize;
      const blob = file.slice(start, Math.min(start + prepared.partSize, file.size));
      let etag = "";
      let partError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const signed = await getPartUrl({ key: prepared.key, uploadId: prepared.uploadId, partNumber });
          await new Promise<void>((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("PUT", signed.url);
            request.upload.onprogress = (event) => {
              if (event.lengthComputable) onProgress?.(Math.round(((start + event.loaded) / file.size) * 100));
            };
            request.onerror = () => reject(r2UploadError(request, `multipart parte ${partNumber}/${totalParts}`));
            request.onload = () => {
              if (request.status < 200 || request.status >= 300) return reject(r2UploadError(request, `multipart parte ${partNumber}/${totalParts}`));
              etag = request.getResponseHeader("ETag")?.replaceAll('"', "") ?? "";
              if (!etag) return reject(new R2UploadError("O R2 não retornou o ETag da parte enviada.", { stage: "multipart etag", status: request.status }));
              resolve();
            };
            request.send(blob);
          });
          partError = undefined;
          break;
        } catch (error) {
          partError = error;
          if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 700 * 2 ** attempt));
        }
      }
      if (partError) throw partError;
      parts.push({ partNumber, etag });
    }
    await completeMultipart({ key: prepared.key, uploadId: prepared.uploadId, parts });
    onProgress?.(100);
  } catch (error) {
    await abortMultipart({ key: prepared.key, uploadId: prepared.uploadId }).catch(() => undefined);
    throw error;
  }
}

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const R2_REFERENCE_PREFIX = "r2://";
const DEFAULT_URL_TTL_SECONDS = 15 * 60;
export const R2_MULTIPART_THRESHOLD_BYTES = 50 * 1024 * 1024;
export const R2_MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024;
export const R2_MAX_MULTIPART_PARTS = 10_000;

const imageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const videoTypes = new Set(["video/mp4", "video/webm"]);
const audioTypes = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a",
  "audio/aac", "audio/ogg", "audio/opus", "audio/webm", "audio/flac", "audio/x-flac",
]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuração de mídia ausente: ${name}.`);
  return value;
}

function configured() {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

let client: S3Client | undefined;

function r2Client() {
  if (!configured()) throw new Error("O armazenamento de mídia R2 ainda não está configurado.");
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: required("R2_ENDPOINT"),
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

function bucket() {
  return required("R2_BUCKET_NAME");
}

export function isR2Reference(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith(R2_REFERENCE_PREFIX));
}

export function isSafeR2Key(key: string) {
  if (!key || key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f\u007f]/.test(key)) return false;
  return key.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function r2KeyFromReference(value: string) {
  if (!isR2Reference(value)) return null;
  const key = value.slice(R2_REFERENCE_PREFIX.length);
  if (!isSafeR2Key(key)) return null;
  return key;
}

export function r2Reference(key: string) {
  if (!isSafeR2Key(key)) throw new Error("Chave de mídia inválida.");
  return `${R2_REFERENCE_PREFIX}${key}`;
}

export function mediaKind(contentType: string) {
  if (imageTypes.has(contentType)) return "image" as const;
  if (videoTypes.has(contentType)) return "video" as const;
  if (audioTypes.has(contentType)) return "audio" as const;
  return null;
}

export function validateMediaUpload({ contentType, size }: { contentType: string; size: number }) {
  const kind = mediaKind(contentType);
  if (!kind) throw new Error("Formato de arquivo não permitido.");
  if (!Number.isFinite(size) || size <= 0) throw new Error("Tamanho de arquivo inválido.");
  return kind;
}

export async function createR2UploadUrl({
  key,
  contentType,
  expiresIn = DEFAULT_URL_TTL_SECONDS,
}: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const url = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
  return { url, expiresIn };
}

export async function createR2MultipartUpload({ key, contentType }: { key: string; contentType: string }) {
  const result = await r2Client().send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
  );
  if (!result.UploadId) throw new Error("Não foi possível iniciar o envio multipart no R2.");
  return result.UploadId;
}

export async function createR2MultipartPartUrl({
  key,
  uploadId,
  partNumber,
  expiresIn = DEFAULT_URL_TTL_SECONDS,
}: {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
}) {
  return getSignedUrl(
    r2Client(),
    new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn },
  );
}

export async function completeR2MultipartUpload({
  key,
  uploadId,
  parts,
}: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  await r2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
    }),
  );
}

export async function abortR2MultipartUpload({ key, uploadId }: { key: string; uploadId: string }) {
  await r2Client().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}

/** Server-side ingestion for trusted remote sources (for example Instagram).
 * Browser uploads always use a short-lived presigned URL instead. */
export async function putR2Object({
  key,
  body,
  contentType,
}: {
  key: string;
  body: BodyInit;
  contentType: string;
}) {
  await r2Client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body as never, ContentType: contentType }),
  );
  return r2Reference(key);
}

export async function createR2ReadUrl(reference: string, expiresIn = DEFAULT_URL_TTL_SECONDS) {
  const key = r2KeyFromReference(reference);
  if (!key) return null;
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function removeR2Reference(reference: string) {
  const key = r2KeyFromReference(reference);
  if (!key) return false;
  await r2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  return true;
}

export async function r2ObjectExists(key: string) {
  try {
    await r2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Copy within R2 without downloading the object's contents to the server. */
export async function copyR2Reference(reference: string, destinationKey: string) {
  const sourceKey = r2KeyFromReference(reference);
  if (!sourceKey || !isSafeR2Key(destinationKey)) throw new Error("Referência de mídia inválida.");
  await r2Client().send(new CopyObjectCommand({
    Bucket: bucket(), Key: destinationKey,
    CopySource: `${bucket()}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
  }));
  return r2Reference(destinationKey);
}

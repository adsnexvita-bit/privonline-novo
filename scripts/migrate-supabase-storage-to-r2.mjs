/* Safe, resumable Supabase Storage -> Cloudflare R2 migration.
 * Default: dry run. --apply copies objects. --update-db switches verified
 * references to r2://legacy/<bucket>/<key>. It never deletes Supabase files.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const updateDb = process.argv.includes("--update-db");
const batchSize = Math.max(1, Number(process.env.MIGRATION_BATCH_SIZE || 50));
const stateFile = process.env.MIGRATION_STATE_FILE || ".r2-storage-migration-state.json";
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const isOpaqueKey = serviceKey.startsWith("sb_secret_") || serviceKey.startsWith("sb_publishable_");
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (isOpaqueKey && headers.get("Authorization") === `Bearer ${serviceKey}`) headers.delete("Authorization");
      headers.set("apikey", serviceKey);
      return fetch(input, { ...init, headers });
    },
  },
});
const r2Bucket = required("R2_BUCKET_NAME");
const r2 = new S3Client({
  region: "auto", endpoint: required("R2_ENDPOINT"),
  credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
});
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : { version: 1, startedAt: new Date().toISOString(), objects: {} };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));
const publicBuckets = new Set(["model-public-images", "category-icons", "free-demonstrations"]);

async function listAll(bucket, prefix = "") {
  const output = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const item of data ?? []) {
      const key = `${prefix}${prefix ? "/" : ""}${item.name}`;
      if (item.id) output.push({ bucket, key, size: Number(item.metadata?.size || 0), contentType: item.metadata?.mimetype || null });
      else output.push(...await listAll(bucket, key));
    }
    if (!data || data.length < 1000) break;
    offset += data.length;
  }
  return output;
}

async function head(key) {
  try { return await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key })); } catch { return null; }
}

async function copyObject(source) {
  const destination = `legacy/${source.bucket}/${source.key}`;
  const existing = await head(destination);
  if (existing && (!source.size || Number(existing.ContentLength) === source.size)) return { destination, status: "verified", bytes: Number(existing.ContentLength || 0) };
  const encodedKey = source.key.split("/").map(encodeURIComponent).join("/");
  const headers = { apikey: serviceKey, ...(isOpaqueKey ? {} : { authorization: `Bearer ${serviceKey}` }) };
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(source.bucket)}/${encodedKey}`, { headers });
  if (!response.ok || !response.body) throw new Error(`Source download failed (${response.status})`);
  const expectedLength = Number(response.headers.get("content-length") || source.size || 0);
  await r2.send(new PutObjectCommand({
    Bucket: r2Bucket, Key: destination, Body: Readable.fromWeb(response.body),
    ContentType: response.headers.get("content-type") || source.contentType || undefined,
    ContentLength: expectedLength || undefined,
    Metadata: { source_bucket: source.bucket, source_key: source.key },
  }));
  const verified = await head(destination);
  if (!verified || (expectedLength && Number(verified.ContentLength) !== expectedLength)) throw new Error("R2 verification failed: size mismatch");
  return { destination, status: "verified", bytes: Number(verified.ContentLength || expectedLength || 0) };
}

async function updateKnownReferences(source, reference) {
  const legacy = `${source.bucket}/${source.key}`;
  const targets = [
    ["model_media", ["file_path", "preview_path"]], ["model_previews", ["file_path"]],
    ["models", ["profile_image_path", "cover_image_path", "profile_cover_image_path", "authorization_document_path", "id_document_path"]],
    ["categories", ["icon_path"]], ["demonstrations", ["file_path", "thumbnail_path"]],
  ];
  for (const [table, columns] of targets) {
    for (const column of columns) {
      const { error } = await supabase.from(table).update({ [column]: reference }).eq(column, legacy);
      if (error && error.code !== "42P01" && error.code !== "42703") throw error;
    }
  }
}

const buckets = (await supabase.storage.listBuckets()).data ?? [];
const inventory = [];
for (const item of buckets) inventory.push(...await listAll(item.name));
console.log(JSON.stringify({ mode: apply ? (updateDb ? "copy-and-update-db" : "copy") : "dry-run", buckets: buckets.map((b) => b.name), total: inventory.length, batchSize }));
for (let start = 0; start < inventory.length; start += batchSize) {
  for (const source of inventory.slice(start, start + batchSize)) {
    const id = `${source.bucket}/${source.key}`;
    const previous = state.objects[id];
    if (previous?.status === "verified") continue;
    state.objects[id] = { ...source, status: "migrating", attempts: (previous?.attempts || 0) + 1, updatedAt: new Date().toISOString() }; save();
    try {
      const result = apply ? await copyObject(source) : { destination: `legacy/${id}`, status: "pending", bytes: source.size };
      const reference = `r2://${result.destination}`;
      if (apply && updateDb) await updateKnownReferences(source, reference);
      state.objects[id] = { ...state.objects[id], ...result, reference, status: result.status, verifiedAt: apply ? new Date().toISOString() : null }; save();
    } catch (error) {
      state.objects[id] = { ...state.objects[id], status: "failed", error: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() }; save();
    }
  }
}
const records = Object.values(state.objects);
const report = { total: records.length, verified: records.filter((x) => x.status === "verified").length, failed: records.filter((x) => x.status === "failed"), bytes: records.reduce((n, x) => n + Number(x.bytes || x.size || 0), 0), stateFile, sourceBuckets: buckets.map((b) => b.name), publicBuckets: [...publicBuckets] };
console.log(JSON.stringify(report, null, 2));
if (report.failed.length) process.exitCode = 1;

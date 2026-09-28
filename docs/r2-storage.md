# Cloudflare R2 media storage

New private media is stored in the `privadinho-online-media` R2 bucket. The
database stores a stable `r2://<object-key>` reference, never a signed URL.
Legacy `bucket/key` values remain readable from Supabase Storage.

## Environment

Set `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `MAX_IMAGE_UPLOAD_SIZE`, and
`MAX_VIDEO_UPLOAD_SIZE` only on the server/Vercel. Do not expose them via a
`VITE_` variable.

## Upload flow

An authenticated admin requests a short-lived presigned URL, the browser PUTs
directly to R2, and only then the metadata record is written to Supabase. The
bucket is private; reads use short-lived signed URLs. R2 CORS must allow only
the production hostname and explicitly approved local hosts.

The current upload client reports XHR progress and retries transient browser
upload failures. Object keys are grouped by `models/{model_id}/content` and
`models/{model_id}/previews`, leaving room for derivative/thumbnail workers.

## Legacy migration

Legacy files are intentionally not deleted. Before running any migration,
apply the Supabase migration and provide the Supabase service key and R2
environment variables to a secure shell. Use a dry-run first, then run the
project migration script with an explicit `--apply` flag. The script must be
idempotent: it checks the destination key before copying and reports failures
for retry. Keep the Supabase files until production has been verified.

## Custom media domain

The bucket stays private. A custom public `media.*` hostname is not configured
because it would expose paid originals. If a public delivery domain is added in
the future, use a separate public-only derivative bucket or a Worker that
authorizes each request.

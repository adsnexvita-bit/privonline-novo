import { existsSync, readFileSync } from "node:fs";
const path = process.env.MIGRATION_STATE_FILE || ".r2-storage-migration-state.json";
if (!existsSync(path)) throw new Error(`State file not found: ${path}`);
const state = JSON.parse(readFileSync(path, "utf8"));
const objects = Object.values(state.objects || {});
console.log(JSON.stringify({
  total: objects.length,
  pending: objects.filter((x) => x.status === "pending").length,
  migrating: objects.filter((x) => x.status === "migrating").length,
  verified: objects.filter((x) => x.status === "verified").length,
  failed: objects.filter((x) => x.status === "failed"),
  bytes: objects.reduce((total, item) => total + Number(item.bytes || item.size || 0), 0),
}, null, 2));

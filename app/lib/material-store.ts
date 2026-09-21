import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getDataDirectory, getDatabase, resolveDataPath, toStoredDataPath } from "./database";
import { MATERIAL_MAX_PAGE_SIZE, MATERIAL_PAGE_SIZE } from "./material-limits";
import { resolvePage } from "./pagination";

export type MaterialType = "cover" | "paragraph" | "ai";
export type MaterialAsset = {
  id: string;
  originalFilename: string;
  storageFilename: string;
  type: MaterialType;
  sizeBytes: number;
  format: "png" | "jpg" | "webp";
  storagePath: string;
  createdAt: string;
  url: string;
};

type MaterialRow = {
  id: string;
  original_filename: string;
  storage_filename: string;
  material_type: MaterialType;
  size_bytes: number;
  format: "png" | "jpg" | "webp";
  storage_path: string;
  created_at: string;
};

const materialsDirectory = path.join(getDataDirectory(), "materials");
const imageFormats = new Set(["png", "jpg", "webp"]);

function materialUrl(id: string) {
  return `/api/materials/${encodeURIComponent(id)}/file`;
}

function cleanFilename(filename: string) {
  const value = path.basename(filename).replace(/[\0-\x1f<>:"/\\|?*]/g, "_").trim();
  return value || "image";
}

function detectImage(buffer: Buffer): { format: "png" | "jpg" | "webp"; contentType: string } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { format: "png", contentType: "image/png" };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { format: "jpg", contentType: "image/jpeg" };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { format: "webp", contentType: "image/webp" };
  return null;
}

function contentTypeForFormat(format: MaterialAsset["format"]) {
  if (format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function rowToAsset(row: MaterialRow): MaterialAsset {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    storageFilename: row.storage_filename,
    type: row.material_type,
    sizeBytes: row.size_bytes,
    format: row.format,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    url: materialUrl(row.id),
  };
}

export function isManualMaterialType(value: unknown): value is "cover" | "paragraph" {
  return value === "cover" || value === "paragraph";
}

export async function saveMaterial(input: { originalFilename: string; type: MaterialType; data: Buffer }) {
  const image = detectImage(input.data);
  if (!image || !imageFormats.has(image.format)) throw new Error("仅支持 PNG、JPG 和 WebP 图片");
  const id = randomUUID();
  const storageFilename = `${randomUUID()}.${image.format}`;
  const directory = path.join(materialsDirectory, input.type);
  const storagePath = path.join(directory, storageFilename);
  const originalFilename = cleanFilename(input.originalFilename);
  const createdAt = new Date().toISOString();
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(storagePath, input.data, { flag: "wx" });
  try {
    getDatabase().prepare(`INSERT INTO material_assets
      (id, original_filename, storage_filename, material_type, size_bytes, format, storage_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, originalFilename, storageFilename, input.type, input.data.length, image.format, toStoredDataPath(storagePath), createdAt);
  } catch (error) {
    await fs.unlink(storagePath).catch(() => undefined);
    throw error;
  }
  return rowToAsset({ id, original_filename: originalFilename, storage_filename: storageFilename, material_type: input.type, size_bytes: input.data.length, format: image.format, storage_path: toStoredDataPath(storagePath), created_at: createdAt });
}

export async function saveGeneratedMaterial(sourcePath: string) {
  const data = await fs.readFile(sourcePath);
  return saveMaterial({ originalFilename: path.basename(sourcePath), type: "ai", data });
}

export function listMaterials(input: { type?: MaterialType; query?: string; page?: unknown; pageSize?: unknown } = {}) {
  const database = getDatabase();
  const query = input.query?.trim();
  const queryFilter = query ? "original_filename LIKE ?" : "";
  const queryValues = query ? [`%${query}%`] : [];
  const filters: string[] = [];
  const values: string[] = [];
  if (input.type) {
    filters.push("material_type = ?");
    values.push(input.type);
  }
  if (queryFilter) {
    filters.push(queryFilter);
    values.push(...queryValues);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const total = Number((database.prepare(`SELECT COUNT(*) AS count FROM material_assets ${where}`).get(...values) as { count: number }).count || 0);
  const requestedSize = Number(input.pageSize);
  const pageSize = Number.isFinite(requestedSize) ? Math.min(MATERIAL_MAX_PAGE_SIZE, requestedSize) : MATERIAL_PAGE_SIZE;
  const paging = resolvePage(input.page, pageSize, total);
  const rows = database.prepare(`SELECT * FROM material_assets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, paging.pageSize, paging.offset) as MaterialRow[];
  const countWhere = queryFilter ? `WHERE ${queryFilter}` : "";
  const countRows = database.prepare(`SELECT material_type AS type, COUNT(*) AS count FROM material_assets ${countWhere} GROUP BY material_type`).all(...queryValues) as Array<{ type: MaterialType; count: number }>;
  const counts = { all: 0, cover: 0, paragraph: 0, ai: 0 };
  for (const row of countRows) {
    counts[row.type] = Number(row.count) || 0;
    counts.all += counts[row.type];
  }
  return { materials: rows.map(rowToAsset), counts, ...paging };
}

export async function resolveMaterialFile(id: string) {
  const row = getDatabase().prepare("SELECT * FROM material_assets WHERE id = ?").get(id) as MaterialRow | undefined;
  if (!row) return null;
  const storagePath = resolveDataPath(row.storage_path);
  if (!storagePath) return null;
  const root = path.resolve(materialsDirectory);
  const relative = path.relative(root, storagePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    await fs.access(storagePath);
    return { asset: rowToAsset(row), filePath: storagePath, contentType: contentTypeForFormat(row.format) };
  } catch {
    return null;
  }
}

export async function readMaterialFile(id: string) {
  const resolved = await resolveMaterialFile(id);
  if (!resolved) return null;
  try {
    const data = await fs.readFile(resolved.filePath);
    const image = detectImage(data);
    if (!image || image.format !== resolved.asset.format) return null;
    return { ...resolved, data, contentType: image.contentType };
  } catch {
    return null;
  }
}

export async function deleteMaterial(id: string) {
  const row = getDatabase().prepare("SELECT * FROM material_assets WHERE id = ?").get(id) as MaterialRow | undefined;
  if (!row) return false;
  const storagePath = resolveDataPath(row.storage_path);
  if (!storagePath) throw new Error("素材文件不在允许删除的目录内");
  const root = path.resolve(materialsDirectory);
  const relative = path.relative(root, storagePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("素材文件不在允许删除的目录内");
  try {
    await fs.unlink(storagePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  getDatabase().prepare("DELETE FROM material_assets WHERE id = ?").run(id);
  return true;
}

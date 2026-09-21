export const MAX_MATERIAL_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MATERIAL_FILES_PER_UPLOAD = 20;
export const MATERIAL_PAGE_SIZE = 12;
export const MATERIAL_MAX_PAGE_SIZE = 48;

export function materialFileLimitLabel() {
  return `${Math.round(MAX_MATERIAL_FILE_BYTES / (1024 * 1024))} MB`;
}

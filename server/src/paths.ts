import fs from 'node:fs';
import path from 'node:path';

export const appRoot = path.join(__dirname, '..');
export const dataDir = path.join(appRoot, 'data');
export const uploadsDir = path.join(dataDir, 'uploads');
export const legacyUploadsDir = path.join(appRoot, 'uploads');
export const photosDir = path.join(uploadsDir, 'photos');
export const filesDir = path.join(uploadsDir, 'files');
export const coversDir = path.join(uploadsDir, 'covers');
export const avatarsDir = path.join(uploadsDir, 'avatars');
export const backupsDir = path.join(dataDir, 'backups');
export const tmpDir = path.join(dataDir, 'tmp');

export function ensureStorageDirs(): void {
  [uploadsDir, photosDir, filesDir, coversDir, avatarsDir, backupsDir, tmpDir].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

export function migrateLegacyUploads(): void {
  if (!fs.existsSync(legacyUploadsDir) || legacyUploadsDir === uploadsDir) return;
  ensureStorageDirs();

  for (const entry of fs.readdirSync(legacyUploadsDir)) {
    const source = path.join(legacyUploadsDir, entry);
    const target = path.join(uploadsDir, entry);
    if (fs.existsSync(source)) {
      fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
    }
  }
}

const path = require('path');
const fs = require('fs');

const appRoot = path.join(__dirname, '..');
const dataDir = path.join(appRoot, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const legacyUploadsDir = path.join(appRoot, 'uploads');
const photosDir = path.join(uploadsDir, 'photos');
const filesDir = path.join(uploadsDir, 'files');
const coversDir = path.join(uploadsDir, 'covers');
const avatarsDir = path.join(uploadsDir, 'avatars');
const backupsDir = path.join(dataDir, 'backups');
const tmpDir = path.join(dataDir, 'tmp');

function ensureStorageDirs() {
  [uploadsDir, photosDir, filesDir, coversDir, avatarsDir, backupsDir, tmpDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function migrateLegacyUploads() {
  if (!fs.existsSync(legacyUploadsDir) || legacyUploadsDir === uploadsDir) return;
  ensureStorageDirs();

  for (const entry of fs.readdirSync(legacyUploadsDir)) {
    const source = path.join(legacyUploadsDir, entry);
    const target = path.join(uploadsDir, entry);
    if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
  }
}

module.exports = {
  appRoot,
  dataDir,
  uploadsDir,
  legacyUploadsDir,
  photosDir,
  filesDir,
  coversDir,
  avatarsDir,
  backupsDir,
  tmpDir,
  ensureStorageDirs,
  migrateLegacyUploads,
};

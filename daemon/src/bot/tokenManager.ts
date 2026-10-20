import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function computeNameHash(name: string): string {
  return crypto.createHash('sha1').update(name ?? '', 'binary').digest('hex').substring(0, 6);
}

export function getPersistentTokenFolder(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const persistentDir = home ? path.resolve(home, '.pebbleafk_tokens') : path.resolve(process.cwd(), 'tokens');
  if (!fs.existsSync(persistentDir)) {
    try {
      fs.mkdirSync(persistentDir, { recursive: true });
    } catch (e) {}
  }
  return persistentDir;
}

export function getAndSyncTokenFolder(): string {
  const localFolder = path.resolve(process.cwd(), 'tokens');
  const persistentFolder = getPersistentTokenFolder();

  if (!fs.existsSync(localFolder)) {
    try {
      fs.mkdirSync(localFolder, { recursive: true });
    } catch (e) {}
  }

  const possibleSources = [
    persistentFolder,
    path.resolve(process.cwd(), '..', 'tokens'),
    path.resolve(process.cwd(), 'profiles'),
    path.resolve(process.env.HOME || '', '.pebbleafk_tokens'),
    path.resolve(process.env.HOME || '', '.pocketafk_tokens'),
    path.resolve(process.env.HOME || '', 'tokens'),
    path.resolve('E:/PocketAFK/tokens'),
    path.resolve('E:/PocketAFK/daemon/tokens'),
    path.resolve('E:/VistaAFK/tokens'),
    path.resolve('E:/VistaAFK/daemon/tokens'),
  ];

  for (const srcDir of possibleSources) {
    if (fs.existsSync(srcDir) && srcDir !== localFolder) {
      try {
        const files = fs.readdirSync(srcDir);
        for (const f of files) {
          if (!f.endsWith('.json')) continue;
          const srcPath = path.join(srcDir, f);
          const destPath = path.join(localFolder, f);
          if (!fs.existsSync(destPath)) {
            try {
              fs.copyFileSync(srcPath, destPath);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }

  return localFolder;
}

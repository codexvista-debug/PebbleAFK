import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function computeNameHash(name: string): string {
  return crypto.createHash('sha1').update(name ?? '', 'binary').digest('hex').substring(0, 6);
}

export function getPersistentTokenFolder(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const persistentDir = home ? path.resolve(home, '.pebbleafk_tokens') : path.resolve(process.cwd(), 'tokens');
  try {
    fs.mkdirSync(persistentDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(persistentDir, 0o700);
  } catch (_) {}
  return persistentDir;
}

/**
 * Use the home-directory cache as the single source of truth. Older releases
 * wrote tokens inside the checkout, so migrate the newest copy of each file
 * once rather than letting a stale backup win on the next restart.
 */
export function getAndSyncTokenFolder(): string {
  const persistentFolder = getPersistentTokenFolder();
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const possibleSources = [
    path.resolve(process.cwd(), 'tokens'),
    path.resolve(process.cwd(), '..', 'tokens'),
    path.resolve(process.cwd(), 'profiles'),
    home ? path.resolve(home, '.pocketafk_tokens') : '',
    home ? path.resolve(home, 'tokens') : '',
  ].filter(Boolean);

  for (const srcDir of possibleSources) {
    if (srcDir === persistentFolder || !fs.existsSync(srcDir)) continue;
    try {
      for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith('.json')) continue;
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(persistentFolder, file);
        const srcStat = fs.statSync(srcPath);
        if (!srcStat.isFile()) continue;

        let shouldCopy = !fs.existsSync(destPath);
        if (!shouldCopy) {
          try { shouldCopy = srcStat.mtimeMs > fs.statSync(destPath).mtimeMs; } catch (_) { shouldCopy = true; }
        }
        if (!shouldCopy) continue;

        const tempPath = path.join(persistentFolder, `.${file}.${process.pid}.tmp`);
        try {
          fs.copyFileSync(srcPath, tempPath);
          fs.utimesSync(tempPath, srcStat.atime, srcStat.mtime);
          try { fs.chmodSync(tempPath, 0o600); } catch (_) {}
          try {
            fs.renameSync(tempPath, destPath);
          } catch (_) {
            try { fs.unlinkSync(destPath); } catch (_) {}
            fs.renameSync(tempPath, destPath);
          }
        } catch (_) {
          try { fs.unlinkSync(tempPath); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  return persistentFolder;
}

/**
 * Migrate a single account's Prismarine Auth cache to its canonical identity.
 * Never guess based on the number of other cached accounts; that can attach the
 * wrong Microsoft session to a Bedrock username. Existing canonical caches are
 * preserved unless the source is known to be the account just verified.
 */
export function migrateTokenCache(
  tokenFolder: string,
  sourceUsername: string,
  targetUsername: string,
  overwrite = false,
): boolean {
  try {
    if (!fs.existsSync(tokenFolder) || !sourceUsername || !targetUsername) return false;
    const sourceHash = computeNameHash(sourceUsername);
    const targetHash = computeNameHash(targetUsername);
    if (sourceHash === targetHash) return true;

    const sourceLiveCache = path.join(tokenFolder, `${sourceHash}_live-cache.json`);
    if (!fs.existsSync(sourceLiveCache)) return false;
    const targetLiveCache = path.join(tokenFolder, `${targetHash}_live-cache.json`);
    if (!overwrite && fs.existsSync(targetLiveCache)) return true;

    const files = fs.readdirSync(tokenFolder).filter((file) => file.startsWith(`${sourceHash}_`) && file.endsWith('.json'));
    for (const file of files) {
      const sourcePath = path.join(tokenFolder, file);
      const targetPath = path.join(tokenFolder, `${targetHash}${file.substring(sourceHash.length)}`);
      if (!overwrite && fs.existsSync(targetPath)) continue;

      const tempPath = `${targetPath}.${process.pid}.tmp`;
      try {
        fs.copyFileSync(sourcePath, tempPath);
        try { fs.chmodSync(tempPath, 0o600); } catch (_) {}
        try {
          fs.renameSync(tempPath, targetPath);
        } catch (_) {
          if (!overwrite) throw _;
          try { fs.unlinkSync(targetPath); } catch (_) {}
          fs.renameSync(tempPath, targetPath);
        }
      } catch (_) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
        throw _;
      }
    }
    return true;
  } catch (err: any) {
    console.warn('[PebbleAFK Auth] Could not migrate one account cache:', err?.message || String(err));
    return false;
  }
}

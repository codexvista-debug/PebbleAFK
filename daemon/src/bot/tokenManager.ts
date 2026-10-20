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

  // 2. Also back up localFolder to persistentFolder
  if (localFolder !== persistentFolder && fs.existsSync(localFolder)) {
    try {
      const files = fs.readdirSync(localFolder);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const srcFile = path.join(localFolder, f);
        const dstFile = path.join(persistentFolder, f);
        if (!fs.existsSync(dstFile) && fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, dstFile);
        }
      }
    } catch (_) {}
  }

  return localFolder;
}

/**
 * Automatically pairs and aliases cached Microsoft OAuth sessions to the target Bedrock account.
 * This ensures that once an account is authorized, PrismarineAuth finds the 90-day rolling refresh token
 * regardless of username casing, email vs Xbox Gamertag, or target variations.
 */
export function ensureTokenAliases(tokenFolder: string, targetUsername: string, realIgn?: string) {
  try {
    if (!fs.existsSync(tokenFolder) || !targetUsername) return;
    const files = fs.readdirSync(tokenFolder);

    const cleanName = targetUsername.replace(/^@/, '').trim();
    const candidateNames = new Set<string>();
    candidateNames.add(cleanName);
    candidateNames.add(cleanName.toLowerCase());
    candidateNames.add(cleanName.toUpperCase());
    if (cleanName.includes('@')) {
      candidateNames.add(cleanName.split('@')[0]);
    }
    if (realIgn) {
      candidateNames.add(realIgn);
      candidateNames.add(realIgn.toLowerCase());
    }

    const targetHashes = new Set<string>();
    for (const name of candidateNames) {
      targetHashes.add(computeNameHash(name));
    }

    // Check if target already has a live cache
    let hasTargetLiveCache = false;
    for (const h of targetHashes) {
      if (fs.existsSync(path.join(tokenFolder, `${h}_live-cache.json`))) {
        hasTargetLiveCache = true;
        break;
      }
    }

    if (hasTargetLiveCache) {
      const existingHash = Array.from(targetHashes).find((h) => fs.existsSync(path.join(tokenFolder, `${h}_live-cache.json`)));
      if (existingHash) {
        mirrorTokenSession(tokenFolder, existingHash, targetHashes);
      }
      return;
    }

    // Scan all live-cache files in tokenFolder
    const allLiveHashes: string[] = [];
    for (const f of files) {
      if (f.endsWith('_live-cache.json')) {
        const hash = f.replace('_live-cache.json', '');
        allLiveHashes.push(hash);
      }
    }

    if (allLiveHashes.length === 1) {
      mirrorTokenSession(tokenFolder, allLiveHashes[0], targetHashes);
    }
  } catch (err: any) {
    console.warn('[PebbleAFK Auth] Token aliasing warning:', err.message);
  }
}

/**
 * Copies all session files (_live, _xbl, _bed, _mcs, _sisu) from a source hash to target hashes
 */
function mirrorTokenSession(tokenFolder: string, sourceHash: string, targetHashes: Set<string>) {
  try {
    const files = fs.readdirSync(tokenFolder);
    for (const targetHash of targetHashes) {
      if (targetHash === sourceHash) continue;
      for (const f of files) {
        if (f.startsWith(`${sourceHash}_`)) {
          const suffix = f.substring(sourceHash.length);
          const src = path.join(tokenFolder, f);
          const dst = path.join(tokenFolder, `${targetHash}${suffix}`);
          if (!fs.existsSync(dst)) {
            try {
              fs.copyFileSync(src, dst);
            } catch (_) {}
          }
        }
      }
    }

    // Also sync mirrored files to persistent storage
    const persistentFolder = getPersistentTokenFolder();
    if (persistentFolder !== tokenFolder) {
      const updatedFiles = fs.readdirSync(tokenFolder);
      for (const f of updatedFiles) {
        if (!f.endsWith('.json')) continue;
        const src = path.join(tokenFolder, f);
        const dst = path.join(persistentFolder, f);
        if (!fs.existsSync(dst)) {
          try {
            fs.copyFileSync(src, dst);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

/**
 * Backs up all cached token files to permanent Android storage
 */
export function backupTokens(tokenFolder: string) {
  try {
    const persistentFolder = getPersistentTokenFolder();
    if (persistentFolder === tokenFolder || !fs.existsSync(tokenFolder)) return;
    const files = fs.readdirSync(tokenFolder);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const src = path.join(tokenFolder, f);
      const dst = path.join(persistentFolder, f);
      try {
        fs.copyFileSync(src, dst);
      } catch (_) {}
    }
  } catch (_) {}
}

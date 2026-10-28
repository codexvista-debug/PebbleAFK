import path from 'path';

const runtimeRequire = eval('require') as NodeRequire;
const minecraftData = runtimeRequire('minecraft-data');

// FreshSMP currently returns its NetherNet server `cpk` as base64 SPKI DER.
// Mojang's current guide describes that claim as a JWK object, and the
// upstream node-nethernet verifier only accepts the JWK form. Normalize both
// encodings while preserving JWT and SDP-fingerprint signature verification.
const crypto = runtimeRequire('crypto');
const jwt = runtimeRequire('jsonwebtoken');
const nethernetIdentity = runtimeRequire('nethernet/src/signalling/sdpIdentity');
nethernetIdentity.verifyServerIdentity = (sdp: string) => {
  const lines = String(sdp).split(/\r?\n/);
  const identities = lines.filter((line: string) => line.startsWith('a=identity:'));
  if (identities.length !== 1) throw new Error('Expected one Nethernet server identity assertion');

  const envelope = JSON.parse(Buffer.from(identities[0].slice('a=identity:'.length), 'base64').toString());
  if (envelope.idp?.protocol !== 'default') throw new Error('Unsupported Nethernet identity protocol');
  const assertion = JSON.parse(envelope.assertion);
  const decoded = jwt.decode(assertion.token, { complete: true });
  const cpk = decoded?.payload?.cpk;
  let key: any;
  if (cpk && typeof cpk === 'object') {
    key = crypto.createPublicKey({ key: cpk, format: 'jwk' });
  } else if (typeof cpk === 'string') {
    if (cpk.includes('-----BEGIN PUBLIC KEY-----')) {
      key = crypto.createPublicKey(cpk);
    } else {
      const encoded = Buffer.from(cpk, 'base64');
      if (encoded[0] === 0x7b) {
        key = crypto.createPublicKey({ key: JSON.parse(encoded.toString('utf8')), format: 'jwk' });
      } else {
        key = crypto.createPublicKey({ key: encoded, format: 'der', type: 'spki' });
      }
    }
  } else {
    throw new Error('Nethernet server identity is missing its public key');
  }

  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'secp384r1') {
    throw new Error('Nethernet server identity key must be EC P-384');
  }
  if (decoded?.header?.alg !== 'ES384') throw new Error('Nethernet server identity must use ES384');
  jwt.verify(assertion.token, key, { algorithms: ['ES384'] });

  const fingerprints = nethernetIdentity.extractFingerprints(sdp);
  if (!fingerprints.length) throw new Error('Missing Nethernet DTLS fingerprint');
  const parts = String(assertion.fingerprints || '').split('.');
  if (parts.length !== 3 || parts[1] !== '') throw new Error('Invalid detached fingerprint signature');
  parts[1] = Buffer.from(JSON.stringify({ fingerprint: fingerprints })).toString('base64url');
  jwt.verify(parts.join('.'), key, { algorithms: ['ES384'] });

  return {
    fingerprint: 'sha256:' + crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex'),
    sdp: lines.filter((line: string) => !line.startsWith('a=identity:')).join('\r\n'),
  };
};

const schemaPath = path.resolve(__dirname, '../../data/bedrock/1.26.60/protocol.json');

if (!minecraftData.versions.bedrock.some((entry: any) => entry.minecraftVersion === '1.26.60')) {
  // Mojang released protocol 2225 before the generated node-minecraft-data npm
  // package included it. This schema is from PrismarineJS/minecraft-data at
  // 9c97fe50a82feb2c0f2be1cff35ce19c891bfb35; keep it pinned in the daemon.
  const fs = runtimeRequire('fs');
  const protocol = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const baseData = minecraftData('bedrock_1.26.51');
  if (!baseData) throw new Error('Cannot install Bedrock 1.26.60 protocol data: 1.26.51 base data is missing.');

  const version = {
    version: 2225,
    minecraftVersion: '1.26.60',
    majorVersion: '1.26',
    releaseType: 'release',
    dataVersion: Number(baseData.version.dataVersion || 0) + 1,
  };
  const dataRoot = path.join(path.dirname(runtimeRequire.resolve('minecraft-data')), 'data.js');
  const data = runtimeRequire(dataRoot);
  data.bedrock['1.26.60'] = { protocol, version };

  minecraftData.versions.bedrock.unshift(version);
  minecraftData.versionsByMinecraftVersion.bedrock['1.26.60'] = version;
  minecraftData.postNettyVersionsByProtocolVersion.bedrock['2225'] = [version];
}

module.exports = runtimeRequire('bedrock-protocol');

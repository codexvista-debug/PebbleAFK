import path from 'path';

const runtimeRequire = eval('require') as NodeRequire;
const minecraftData = runtimeRequire('minecraft-data');
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

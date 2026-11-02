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

// Cache compiled ProtoDef code per Bedrock version so creating/reconnecting
// multiple bots does not re-generate and eval() ~40MB of protocol JS on every
// serializer/deserializer instantiation (which blocks the event loop and OOMs
// Termux's V8 heap after 10-15 minutes with 10+ bots).
// IMPORTANT: Must patch Client.prototype.init directly because
// bedrock-protocol/src/client.js destructures { createDeserializer, createSerializer }
// at require time!
try {
  const bpSerializer = runtimeRequire('bedrock-protocol/src/transforms/serializer');
  const { Client } = runtimeRequire('bedrock-protocol/src/client');
  const { CompiledProtodef, ProtoDefCompiler } = runtimeRequire('protodef').Compiler;
  const { FullPacketParser, Serializer } = runtimeRequire('protodef');
  const compiledFactoryCache = new Map<string, {
    sizeOfFactory: () => Record<string, any>;
    writeFactory: () => Record<string, any>;
    readFactory: () => Record<string, any>;
  }>();

  const originalCreateProtocol = bpSerializer.createProtocol;
  const originalCreateSerializer = bpSerializer.createSerializer;
  const originalCreateDeserializer = bpSerializer.createDeserializer;

  const getCachedProtocol = (version: string) => {
    try {
      let cached = compiledFactoryCache.get(version);
      if (!cached) {
        try {
          runtimeRequire(`bedrock-protocol/data/${version}/size.js`);
          return bpSerializer.getProtocol(version);
        } catch (_) {}

        const protocol = minecraftData('bedrock_' + version).protocol;
        const compiler = new ProtoDefCompiler();
        compiler.addTypesToCompile(protocol.types);
        compiler.addTypes(runtimeRequire('bedrock-protocol/src/datatypes/compiler-minecraft'));

        const sizeOfCode = compiler.sizeOfCompiler.generate();
        const writeCode = compiler.writeCompiler.generate();
        const readCode = compiler.readCompiler.generate();

        const compileFactory = (subCompiler: any, code: string) => {
          const native = subCompiler.native; // eslint-disable-line @typescript-eslint/no-unused-vars
          const { PartialReadError } = runtimeRequire('protodef/src/utils'); // eslint-disable-line @typescript-eslint/no-unused-vars
          return eval(code);
        };

        cached = {
          sizeOfFactory: compileFactory(compiler.sizeOfCompiler, sizeOfCode),
          writeFactory: compileFactory(compiler.writeCompiler, writeCode),
          readFactory: compileFactory(compiler.readCompiler, readCode),
        };
        compiledFactoryCache.set(version, cached);
      }

      // Each client gets its own fresh ctx object (so per-client variables like
      // ShieldItemID are isolated), while sharing the compiled V8 SharedFunctionInfo!
      return new CompiledProtodef(
        cached.sizeOfFactory(),
        cached.writeFactory(),
        cached.readFactory(),
      );
    } catch (_) {
      return originalCreateProtocol(version);
    }
  };

  const makeCachedSerializer = (version: string) => {
    try {
      return new Serializer(getCachedProtocol(version), 'mcpe_packet');
    } catch (_) {
      return originalCreateSerializer(version);
    }
  };

  const makeCachedDeserializer = (version: string) => {
    try {
      const parser = new FullPacketParser(getCachedProtocol(version), 'mcpe_packet') as any;
      parser.dumpFailedBuffer = () => {};
      parser.verify = () => {};
      return parser;
    } catch (_) {
      return originalCreateDeserializer(version);
    }
  };

  bpSerializer.createProtocol = getCachedProtocol;
  bpSerializer.createSerializer = makeCachedSerializer;
  bpSerializer.createDeserializer = makeCachedDeserializer;

  // Replace Client.prototype.init so it uses makeCachedSerializer / makeCachedDeserializer
  // instead of the un-cached destructured functions in bedrock-protocol/src/client.js!
  const KeyExchange = runtimeRequire('bedrock-protocol/src/handshake/keyExchange');
  const Login = runtimeRequire('bedrock-protocol/src/handshake/login');
  const LoginVerify = runtimeRequire('bedrock-protocol/src/handshake/loginVerify');
  const initRaknet = runtimeRequire('bedrock-protocol/src/rak');
  const { NethernetClient } = runtimeRequire('bedrock-protocol/src/nethernet');

  Client.prototype.init = function () {
    if (this._closed) return;
    this.options.nethernet ??= {};
    this.options.nethernet.signalling ??= 'lan';
    this.validateOptions();
    this.compressionAlgorithm = this.versionGreaterThanOrEqualTo('1.19.30') ? 'none' : 'deflate';
    this.serializer = makeCachedSerializer(this.options.version);
    this.deserializer = makeCachedDeserializer(this.options.version);
    this._loadFeatures();

    KeyExchange(this);
    Login(this, null, this.options);
    LoginVerify(this, null, this.options);

    const host = this.options.host;
    const port = this.options.port;
    const networkId = this.options.nethernet?.networkId;

    if (this.options.transport === 'nethernet') {
      this.nethernet ??= {};
      this.connection = new NethernetClient({ networkId, host: this.options.host, ...this.options.nethernet, port: this.options.port });
      this.batchHeader = null;
      this.disableEncryption = true;
    } else if (this.options.transport === 'raknet') {
      const { RakClient } = initRaknet(this.options.raknetBackend);
      this.connection = new RakClient({
        useWorkers: this.options.useRaknetWorkers,
        host,
        port,
        raknetProtocolVersion: this.versionGreaterThanOrEqualTo('1.19.30') ? 11 : 10,
      }, this);
      this.batchHeader = 0xfe;
      this.disableEncryption = false;
    }

    if (this.connection) {
      this.connection.onError = (error: any) => this.onConnectionError(error);
    }
    this.emit('connect_allowed');
  };
} catch (_) {}

// Also cache Nethernet's discovery ProtoDef protocol so NethernetClient does
// not re-compile and eval() its protocol schema on every connection/ping.
try {
  const nethernetSerializer = runtimeRequire('nethernet/src/transforms/serializer');
  let cachedNethernetProto: any = null;
  const origNethernetCreateProtocol = nethernetSerializer.createProtocol;
  nethernetSerializer.createProtocol = () => {
    if (!cachedNethernetProto) {
      cachedNethernetProto = origNethernetCreateProtocol();
    }
    return cachedNethernetProto;
  };
  nethernetSerializer.createSerializer = () => {
    const { Serializer } = runtimeRequire('protodef');
    return new Serializer(nethernetSerializer.createProtocol(), 'nethernet_packet');
  };
  nethernetSerializer.createDeserializer = () => {
    const { FullPacketParser } = runtimeRequire('protodef');
    return new FullPacketParser(nethernetSerializer.createProtocol(), 'nethernet_packet');
  };
} catch (_) {}

// Fast-path packet filter for headless AFK bots:
// Skips expensive ProtoDef + NBT deserialization for heavy world/rendering
// packets (level_chunk, update_block, biome_definition_list, crafting_data,
// available_commands, etc.) that headless AFK bots never inspect.
try {
  const [readVarInt] = runtimeRequire('protodef').types.varint;
  const { Client } = runtimeRequire('bedrock-protocol/src/client');

  // Packets required by bedrock-protocol handshake or PebbleBotInstance:
  // 1: login, 2: play_status, 3: server_to_client_handshake, 4: client_to_server_handshake,
  // 5: disconnect, 6: resource_packs_info, 7: resource_pack_stack, 8: resource_pack_client_response,
  // 9: text, 11: start_game, 19: move_player, 23: tick_sync, 29: update_attributes,
  // 42: set_health, 45: respawn, 61: change_dimension, 70: chunk_radius_update,
  // 74: boss_event, 85: transfer, 88: set_title, 100: modal_form_request,
  // 115: network_stack_latency, 121: network_chunk_publisher_update,
  // 143: network_settings, 162: item_registry
  const ESSENTIAL_INBOUND_PACKET_IDS = new Set<number>([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 19, 23, 29, 42, 45, 61, 70, 74, 85, 88, 100, 115, 121, 143, 162,
  ]);

  const origReadPacket = Client.prototype.readPacket;
  Client.prototype.readPacket = function (packet: Buffer) {
    try {
      if (packet && packet.length > 0) {
        const { value: header } = readVarInt(packet, 0);
        const packetId = header & 0x3ff;
        if (!ESSENTIAL_INBOUND_PACKET_IDS.has(packetId)) {
          // Still emit a lightweight packet heartbeat so lastPacketReceivedAt stays fresh
          this.emit('heartbeat');
          this.emit('packet', { data: { name: 'ignored_world_packet', params: {} } });
          return;
        }
      }
    } catch (_) {}
    return origReadPacket.call(this, packet);
  };
} catch (_) {}

module.exports = runtimeRequire('bedrock-protocol');

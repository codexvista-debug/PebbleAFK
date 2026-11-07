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
  const Options = runtimeRequire('bedrock-protocol/src/options');
  if (Options?.defaultOptions) {
    Options.defaultOptions.viewDistance = 2;
    Options.defaultOptions.compressionLevel = 1;
    Options.defaultOptions.batchingInterval = 100;
  }
  const KeyExchange = runtimeRequire('bedrock-protocol/src/handshake/keyExchange');
  const Login = runtimeRequire('bedrock-protocol/src/handshake/login');
  const LoginVerify = runtimeRequire('bedrock-protocol/src/handshake/loginVerify');
  const initRaknet = runtimeRequire('bedrock-protocol/src/rak');
  const { NethernetClient } = runtimeRequire('bedrock-protocol/src/nethernet');

  Client.prototype.init = function () {
    if (this._closed) return;
    this.options.nethernet ??= {};
    this.options.nethernet.signalling ??= 'lan';
    this.options.viewDistance ??= 2;
    this.options.compressionLevel = 1;
    this.options.batchingInterval ??= 100;
    this.viewDistance = this.options.viewDistance || 2;
    this.compressionLevel = 1;
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

// Optimize Nethernet & Werift SCTP for 6-15+ simultaneous mobile bots:
// 1. Eliminate O(N^2) Buffer.concat in Nethernet multi-segment packet reassembly.
// 2. Eliminate per-packet Set/Array allocations and string-based TSN sorting in Werift SCTP.
try {
  const NethernetConnection = runtimeRequire('nethernet/src/connection');
  if (NethernetConnection?.prototype) {
    NethernetConnection.prototype.handleMessage = function (data: Buffer) {
      if (!data || data.length < 1) {
        throw new Error('Unexpected EOF — Empty message moved through transport');
      }
      const segments = data[0];
      const payload = data.subarray(1);

      if (this.expectedSegments > 0) {
        if (this.expectedSegments - 1 !== segments) {
          const err = new Error(`Invalid remaining segment count: expected ${this.expectedSegments - 1}, got ${segments}`);
          this.buf = null;
          this._chunks = null;
          this.expectedSegments = 0;
          throw err;
        }
        this._chunks.push(payload);
      } else if (segments > 0) {
        this._chunks = [payload];
      } else {
        this.buf = payload;
      }

      this.expectedSegments = segments;
      if (this.expectedSegments === 0) {
        const fullPacket = this._chunks ? Buffer.concat(this._chunks) : this.buf;
        this._chunks = null;
        this.buf = null;
        this.nethernet.emit('encapsulated', { buffer: fullPacket }, this.address);
      }
    };
  }
} catch (_) {}

try {
  const weriftSctp = runtimeRequire('werift/lib/sctp/src/sctp');
  const SCTP_DATA_LAST_FRAG = 0x01;
  const SCTP_DATA_FIRST_FRAG = 0x02;
  const SCTP_DATA_UNORDERED = 0x04;
  const uint32Gt = (a: number, b: number) => {
    const halfMod = 0x80000000;
    return (a < b && b - a > halfMod) || (a > b && a - b < halfMod);
  };
  const uint32Gte = (a: number, b: number) => a === b || uint32Gt(a, b);
  const tsnPlusOne = (a: number) => (a + 1) >>> 0;
  const uint16Add = (a: number, b: number) => (a + b) & 0xffff;

  if (weriftSctp?.InboundStream?.prototype) {
    weriftSctp.InboundStream.prototype.popMessages = function* () {
      let pos = 0;
      let startPos: number | undefined;
      let expectedTsn = 0;
      let ordered: boolean | undefined;
      while (pos < this.reassembly.length) {
        const chunk = this.reassembly[pos];
        if (pos === 0) {
          ordered = (chunk.flags & SCTP_DATA_UNORDERED) === 0;
          if ((chunk.flags & SCTP_DATA_FIRST_FRAG) === 0) {
            if (ordered) break;
            pos++;
            continue;
          }
          if (ordered && uint16Gt(chunk.streamSeqNum, this.sequenceNumber)) {
            break;
          }
          expectedTsn = chunk.tsn;
          startPos = pos;
        } else if (chunk.tsn !== expectedTsn) {
          if (ordered) break;
          startPos = undefined;
          pos++;
          continue;
        }
        if (startPos === undefined) {
          if ((chunk.flags & SCTP_DATA_FIRST_FRAG) > 0) {
            expectedTsn = chunk.tsn;
            startPos = pos;
          } else {
            pos++;
            continue;
          }
        }
        if ((chunk.flags & SCTP_DATA_LAST_FRAG) > 0) {
          let userData: Buffer;
          if (startPos === 0 && pos === 0) {
            this.reassembly.shift();
            userData = chunk.userData;
          } else {
            const arr = this.reassembly.splice(startPos, pos - startPos + 1);
            userData = arr.length === 1 ? arr[0].userData : Buffer.concat(arr.map((v: any) => v.userData));
          }
          pos = startPos;
          if (ordered && chunk.streamSeqNum === this.sequenceNumber) {
            this.sequenceNumber = uint16Add(this.sequenceNumber, 1);
          }
          yield [chunk.streamId, chunk.protocol, userData];
          startPos = undefined;
          continue;
        }
        pos++;
        expectedTsn = tsnPlusOne(expectedTsn);
      }
    };
  }

  function uint16Gt(a: number, b: number) {
    const halfMod = 0x8000;
    return (a < b && b - a > halfMod) || (a > b && a - b < halfMod);
  }

  if (weriftSctp?.SCTP?.prototype) {
    const sctpChunk = runtimeRequire('werift/lib/sctp/src/chunk');
    weriftSctp.SCTP.prototype.markReceived = function (tsn: number) {
      if (uint32Gte(this.lastReceivedTsn, tsn) || this.sackMisOrdered.has(tsn)) {
        this.sackDuplicates.push(tsn);
        return true;
      }
      if (tsn === tsnPlusOne(this.lastReceivedTsn)) {
        this.lastReceivedTsn = tsn;
        while (this.sackMisOrdered.has(tsnPlusOne(this.lastReceivedTsn))) {
          this.lastReceivedTsn = tsnPlusOne(this.lastReceivedTsn);
          this.sackMisOrdered.delete(this.lastReceivedTsn);
        }
      } else {
        this.sackMisOrdered.add(tsn);
      }
      if (this.sackDuplicates.length > 0) {
        const last = this.lastReceivedTsn;
        this.sackDuplicates = this.sackDuplicates.filter((x: number) => uint32Gt(x, last));
      }
      if (this.sackMisOrdered.size > 0) {
        const last = this.lastReceivedTsn;
        for (const x of this.sackMisOrdered) {
          if (!uint32Gt(x, last)) this.sackMisOrdered.delete(x);
        }
      }
      return false;
    };

    if (sctpChunk?.SackChunk) {
      weriftSctp.SCTP.prototype.sendSack = async function () {
        if (this.isStopped || !this.sackNeeded) return;
        const gaps: Array<[number, number]> = [];
        if (this.sackMisOrdered.size > 0) {
          const last = this.lastReceivedTsn;
          const sorted = [...this.sackMisOrdered].sort(
            (a: number, b: number) => ((a - last) >>> 0) - ((b - last) >>> 0)
          );
          let gapNext: number | undefined;
          for (const tsn of sorted) {
            const pos = ((tsn - last) >>> 0) & 0xffff;
            if (tsn === gapNext && gaps.length > 0) {
              gaps[gaps.length - 1][1] = pos;
            } else {
              gaps.push([pos, pos]);
            }
            gapNext = tsnPlusOne(tsn);
          }
        }
        const sack = new sctpChunk.SackChunk(0, undefined);
        sack.cumulativeTsn = this.lastReceivedTsn;
        sack.advertisedRwnd = Math.max(0, this.advertisedRwnd);
        sack.duplicates = this.sackDuplicates.length > 0 ? [...this.sackDuplicates] : [];
        sack.gaps = gaps;
        await this.sendChunk(sack).catch(() => {});
        if (this.sackDuplicates.length > 0) this.sackDuplicates = [];
        this.sackNeeded = false;
        this.sackPacketCount = 0;
        this.sackImmediate = false;
      };
    }
  }
} catch (_) {}

// Fast-path packet & Framer filter for headless AFK bots:
// 1. Replaces Framer.decompress's 512KB per-batch C++ allocation with a compact
//    pooled chunk size so 6-15 bots do not allocate 100+ MB/sec of native ArrayBuffers.
// 2. Filters out non-essential world/entity packets inside Framer.getPackets BEFORE
//    allocating Buffers or copying bytes.
// 3. Fast-paths item_registry (packet 162) via native Buffer.indexOf.
try {
  const zlib = runtimeRequire('zlib');
  const [readVarInt] = runtimeRequire('protodef').types.varint;
  const { Client } = runtimeRequire('bedrock-protocol/src/client');
  const { Framer } = runtimeRequire('bedrock-protocol/src/transforms/framer');

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
  const SHIELD_ITEM_MARKER = Buffer.from('\x10minecraft:shield', 'utf8');
  // VarInt 1022 (0xfe 0x07) -> packetId 1022 (non-essential sentinel)
  const IGNORED_PACKET_SENTINEL = Buffer.from([0xfe, 0x07]);
  const IGNORED_PACKET_EVENT = Object.freeze({
    data: Object.freeze({ name: 'ignored_world_packet', params: Object.freeze({}) }),
  });

  if (Framer) {
    const origDecompress = Framer.decompress;
    Framer.decompress = function (algorithm: any, buffer: Buffer) {
      if (algorithm === 0 || algorithm === 'deflate') {
        const chunkSize = Math.min(Math.max(buffer.byteLength * 2, 2048), 16384);
        return zlib.inflateRawSync(buffer, { chunkSize });
      }
      return origDecompress.call(this, algorithm, buffer);
    };

    Framer.decode = function (client: any, buf: Buffer) {
      if (client.batchHeader && buf[0] !== client.batchHeader) {
        throw Error(`bad batch packet header, received: ${buf[0]}, expected: ${client.batchHeader}`);
      }
      const buffer = buf.subarray(client.batchHeader ? 1 : 0);
      let decompressed: Buffer;
      if (client.features?.compressorInHeader && client.compressionReady) {
        decompressed = this.decompress(buffer[0], buffer.subarray(1));
      } else {
        try {
          decompressed = this.decompress(client.compressionAlgorithm, buffer);
        } catch (_) {
          decompressed = buffer;
        }
      }
      return Framer.getPackets(decompressed);
    };

    Framer.getPackets = function (buffer: Buffer) {
      const packets: Buffer[] = [];
      let offset = 0;
      let hadIgnored = false;
      const totalLen = buffer.byteLength;
      while (offset < totalLen) {
        const { value, size } = readVarInt(buffer, offset);
        offset += size;
        if (value <= 0 || offset + value > totalLen) break;
        const { value: header } = readVarInt(buffer, offset);
        const packetId = header & 0x3ff;
        if (!ESSENTIAL_INBOUND_PACKET_IDS.has(packetId)) {
          hadIgnored = true;
          offset += value;
          continue;
        }
        const dec = Buffer.allocUnsafe(value);
        buffer.copy(dec, 0, offset, offset + value);
        offset += value;
        packets.push(dec);
      }
      if (packets.length === 0 && hadIgnored) {
        packets.push(IGNORED_PACKET_SENTINEL);
      }
      return packets;
    };
  }

  const origReadPacket = Client.prototype.readPacket;
  Client.prototype.readPacket = function (packet: Buffer) {
    try {
      if (packet === IGNORED_PACKET_SENTINEL) {
        this.emit('heartbeat');
        this.emit('packet', IGNORED_PACKET_EVENT);
        return;
      }
      if (packet && packet.length > 0) {
        const { value: header } = readVarInt(packet, 0);
        const packetId = header & 0x3ff;
        if (packetId === 162) {
          // Fast-path item_registry (packet 162): extract ShieldItemID in native C++ Buffer.indexOf
          // without deserializing 1,500+ item NBT compounds on the single-threaded mobile CPU.
          const idx = packet.indexOf(SHIELD_ITEM_MARKER);
          if (idx !== -1 && idx + SHIELD_ITEM_MARKER.length + 2 <= packet.length) {
            const shieldId = packet.readInt16LE(idx + SHIELD_ITEM_MARKER.length);
            this.serializer?.proto?.setVariable?.('ShieldItemID', shieldId);
            this.deserializer?.proto?.setVariable?.('ShieldItemID', shieldId);
          }
          this.emit('heartbeat');
          this.emit('packet', { data: { name: 'item_registry', params: { itemstates: [] } } });
          this.emit('item_registry', { itemstates: [] });
          return;
        }
        if (!ESSENTIAL_INBOUND_PACKET_IDS.has(packetId)) {
          // Still emit a lightweight packet heartbeat so lastPacketReceivedAt stays fresh
          this.emit('heartbeat');
          this.emit('packet', IGNORED_PACKET_EVENT);
          return;
        }
      }
    } catch (_) {}
    const res = origReadPacket.call(this, packet);
    if (this.startGameData && Object.keys(this.startGameData).length > 1) {
      this.startGameData = { runtime_entity_id: this.startGameData.runtime_entity_id };
    }
    return res;
  };
} catch (_) {}

module.exports = runtimeRequire('bedrock-protocol');

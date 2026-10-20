const fs = require('node:fs')
const path = require('node:path')

function patchFile (relativePath, before, after, marker, label) {
  const filePath = path.resolve(__dirname, '..', relativePath)
  let source = fs.readFileSync(filePath, 'utf8')
  if (source.includes(marker)) return

  const matches = source.split(before).length - 1
  if (matches !== 1) {
    throw new Error(`Expected one ${label} patch point in ${relativePath}, found ${matches}.`)
  }

  source = source.replace(before, after)
  fs.writeFileSync(filePath, source, 'utf8')
  console.log(`[VistaAFK Mobile] Applied ${label}.`)
}

try {
  patchFile(
    'node_modules/jsp-raknet/js/Client.js',
    '    constructor(hostname, port) {',
    '    constructor(hostname, port, options = {}) {',
    'constructor(hostname, port, options = {})',
    'RakNet constructor options'
  )
  patchFile(
    'node_modules/jsp-raknet/js/Client.js',
    '        this.port = port;\n        this.address = new InetAddress_1.default(this.hostname, this.port);',
    '        this.port = port;\n        this.protocolVersion = options.protocolVersion ?? 10;\n        this.address = new InetAddress_1.default(this.hostname, this.port);',
    'this.protocolVersion = options.protocolVersion ?? 10',
    'current Bedrock RakNet protocol selection'
  )
  patchFile(
    'node_modules/jsp-raknet/js/Client.js',
    '        packet.protocol = RAKNET_PROTOCOL;',
    '        packet.protocol = this.protocolVersion;',
    'packet.protocol = this.protocolVersion',
    'current Bedrock RakNet protocol handshake'
  )

  patchFile(
    'node_modules/bedrock-protocol/src/client.js',
    '      this.connection = new RakClient({ useWorkers: this.options.useRaknetWorkers, host, port }, this)',
    "      this.connection = new RakClient({ useWorkers: this.options.useRaknetWorkers, host, port, raknetProtocolVersion: this.versionGreaterThanOrEqualTo('1.19.30') ? 11 : 10 }, this)",
    'raknetProtocolVersion: this.versionGreaterThanOrEqualTo',
    'Bedrock protocol version handoff'
  )

  patchFile(
    'node_modules/bedrock-protocol/src/rak.js',
    `  async plainConnect (host = this.options.host, port = this.options.port) {
    this.raknet = new Client(host, port)
    await this.raknet.connect()

    this.raknet.on('connecting', () => {
      console.log(\`[client] connecting to \${host}/\${port}\`)
    })

    this.raknet.on('connected', this.onConnected)
    this.raknet.on('encapsulated', (encapsulated, addr) => this.onEncapsulated(encapsulated, addr.hash))
    this.raknet.on('disconnect', (reason) => this.onCloseConnection(reason))
  }`,
    `  async plainConnect (host = this.options.host, port = this.options.port) {
    this.raknet = new Client(host, port, { protocolVersion: this.options.raknetProtocolVersion })

    // Register before opening the socket: the RakNet handshake can complete
    // while Client.connect() is still waiting on its first retry interval.
    this.raknet.on('connecting', () => {
      console.log(\`[client] connecting to \${host}/\${port}\`)
    })
    this.raknet.on('connected', this.onConnected)
    this.raknet.on('encapsulated', (encapsulated, addr) => this.onEncapsulated(encapsulated, addr.hash))
    this.raknet.on('disconnect', (reason) => this.onCloseConnection(reason))

    await this.raknet.connect()
  }`,
    'protocolVersion: this.options.raknetProtocolVersion',
    'RakNet handshake listener ordering'
  )

  patchFile(
    'node_modules/bedrock-protocol/src/options.js',
    'function validateOptions (options) {',
    'function validateOptions (options) {\n  if (options && (options.version === "26.52" || options.version === "1.26.52" || (typeof options.version === "string" && options.version.startsWith("26.")))) { options.version = "1.26.51"; }',
    'options.version = "1.26.51"',
    'Bedrock 26.52 protocol alias fallback'
  )

  patchFile(
    'node_modules/jsp-raknet/js/protocol/Packet.js',
    "        address.address.split('.', 4).forEach(b => this.writeByte(-b - 1));",
    "        const parts = String(address.address || '0.0.0.0').split('.'); for (let i = 0; i < 4; i++) { const num = parseInt(parts[i], 10); this.writeByte(Number.isFinite(num) ? (-num - 1) : 255); }",
    'Number.isFinite(num) ? (-num - 1) : 255',
    'safe IPv4 address packet encoding'
  )

  patchFile(
    'node_modules/jsp-raknet/js/Connection.js',
    '        if (this.recvQueue.length) {\n            const messages = this.recvQueue.splice(0, 4);',
    '        if (this.recvQueue.length) {\n            const messages = this.recvQueue.splice(0, this.recvQueue.length);',
    'this.recvQueue.splice(0, this.recvQueue.length)',
    'jsp-raknet unthrottled receive queue'
  )

  patchFile(
    'node_modules/jsp-raknet/js/Connection.js',
    '    recieve(buffer) {\n        this.recvQueue.push(buffer);\n        this.lastUpdate = Date.now();\n    }',
    '    recieve(buffer) {\n        this.lastUpdate = Date.now();\n        try {\n            this.receiveOnline(buffer);\n            if (this.ackQueue.length > 0) {\n                const pk = new ACK_1.default();\n                pk.packets = this.ackQueue;\n                pk.encode();\n                this.sendPacket(pk);\n                this.ackQueue = [];\n            }\n        } catch (_) {\n            this.recvQueue.push(buffer);\n        }\n    }',
    'this.receiveOnline(buffer)',
    'jsp-raknet zero-latency incoming packet dispatch'
  )
} catch (error) {
  console.error(`[VistaAFK Mobile] Could not patch the Bedrock transport: ${error.message}`)
  process.exitCode = 1
}

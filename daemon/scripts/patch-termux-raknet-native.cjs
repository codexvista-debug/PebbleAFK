const fs = require('node:fs')
const path = require('node:path')

const sourcePath = path.resolve(__dirname, '..', 'node_modules/raknet-native/src/RakClient.cpp')
const before = 'packets[i] = Napi::ArrayBuffer::New'
const after = 'packets[static_cast<unsigned int>(i)] = Napi::ArrayBuffer::New'

if (!fs.existsSync(sourcePath)) {
  throw new Error(`raknet-native source is missing: ${sourcePath}`)
}

const source = fs.readFileSync(sourcePath, 'utf8')
if (source.includes(after)) {
  console.log('[VistaAFK Mobile] Native RakNet Termux compiler fix is already applied.')
  process.exit(0)
}

const matches = source.split(before).length - 1
if (matches !== 1) {
  throw new Error(`Expected one RakNet array-index compiler fix point, found ${matches}.`)
}

fs.writeFileSync(sourcePath, source.replace(before, after), 'utf8')
console.log('[VistaAFK Mobile] Applied the Termux C++ array-index compatibility fix.')

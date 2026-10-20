const fs = require('node:fs')
const path = require('node:path')

const candidateDirs = [
  path.resolve(__dirname, '..', 'node_modules/node-addon-api'),
  path.resolve(__dirname, '..', 'node_modules/raknet-native/node_modules/node-addon-api')
].filter(dir => fs.existsSync(path.join(dir, 'napi.h')) && fs.existsSync(path.join(dir, 'napi-inl.h')))

if (candidateDirs.length === 0) {
  throw new Error('node-addon-api headers are missing from node_modules')
}

function replaceOnce(filePath, before, after, label) {
  const source = fs.readFileSync(filePath, 'utf8')
  const matches = source.split(before).length - 1
  if (matches === 0 && source.includes(after)) return false
  if (matches !== 1) {
    throw new Error(`Expected one ${label} patch point, found ${matches} in ${filePath}.`)
  }

  fs.writeFileSync(filePath, source.replace(before, after), 'utf8')
  return true
}

const changed = []
for (const packageDir of candidateDirs) {
  const headerPath = path.join(packageDir, 'napi.h')
  const inlinePath = path.join(packageDir, 'napi-inl.h')

  if (replaceOnce(
    headerPath,
    '    static const napi_typedarray_type unknown_array_type = static_cast<napi_typedarray_type>(-1);',
    '    // Termux-safe: avoid an out-of-range enum constant rejected by Clang.',
    'invalid enum sentinel removal'
  )) changed.push(`${path.basename(path.dirname(packageDir))}/napi.h sentinel`)

if (replaceOnce(
  headerPath,
  '        : unknown_array_type;',
  '        : napi_int8_array;',
  'typed-array fallback'
)) changed.push('napi.h fallback')

if (replaceOnce(
  inlinePath,
  `inline TypedArray::TypedArray()
  : Object(), _type(TypedArray::unknown_array_type), _length(0) {
}

inline TypedArray::TypedArray(napi_env env, napi_value value)
  : Object(env, value), _type(TypedArray::unknown_array_type), _length(0) {
}

inline TypedArray::TypedArray(napi_env env,
                              napi_value value,
                              napi_typedarray_type type,
                              size_t length)
  : Object(env, value), _type(type), _length(length) {
}

inline napi_typedarray_type TypedArray::TypedArrayType() const {
  if (_type == TypedArray::unknown_array_type) {
    napi_status status = napi_get_typedarray_info(_env, _value,
      &const_cast<TypedArray*>(this)->_type, &const_cast<TypedArray*>(this)->_length,
      nullptr, nullptr, nullptr);
    NAPI_THROW_IF_FAILED(_env, status, napi_int8_array);
  }

  return _type;
}`,
  `inline TypedArray::TypedArray()
  : Object(), _type(napi_int8_array), _length(0) {
}

inline TypedArray::TypedArray(napi_env env, napi_value value)
  : Object(env, value), _type(napi_int8_array), _length(0) {
  if (value != nullptr) {
    napi_status status = napi_get_typedarray_info(_env, _value,
      &const_cast<TypedArray*>(this)->_type, &const_cast<TypedArray*>(this)->_length,
      nullptr, nullptr, nullptr);
    NAPI_THROW_IF_FAILED_VOID(_env, status);
  }
}

inline TypedArray::TypedArray(napi_env env,
                              napi_value value,
                              napi_typedarray_type type,
                              size_t length)
  : Object(env, value), _type(type), _length(length) {
}

inline napi_typedarray_type TypedArray::TypedArrayType() const {
  return _type;
}`,
  'TypedArray metadata initialization'
)) changed.push('napi-inl.h initialization')

  if (replaceOnce(
    inlinePath,
    `inline size_t TypedArray::ElementLength() const {
  if (_type == TypedArray::unknown_array_type) {
    napi_status status = napi_get_typedarray_info(_env, _value,
      &const_cast<TypedArray*>(this)->_type, &const_cast<TypedArray*>(this)->_length,
      nullptr, nullptr, nullptr);
    NAPI_THROW_IF_FAILED(_env, status, 0);
  }

  return _length;
}`,
    `inline size_t TypedArray::ElementLength() const {
  return _length;
}`,
    'TypedArray length lookup'
  )) changed.push(`${path.basename(path.dirname(packageDir))}/napi-inl.h length lookup`)
}

console.log(changed.length
  ? `[VistaAFK Mobile] Applied node-addon-api Termux compatibility fixes (${changed.join(', ')}).`
  : '[VistaAFK Mobile] node-addon-api Termux compatibility fixes are already applied.')

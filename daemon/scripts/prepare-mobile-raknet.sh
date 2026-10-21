#!/bin/bash
set -u

case "${PREFIX:-}" in
  *termux*) ;;
  *)
    if [ -z "${TERMUX_VERSION:-}" ]; then
      exit 0
    fi
    ;;
esac

if node -e "require('raknet-native')" >/dev/null 2>&1; then
  echo "✅ Native RakNet backend is ready for Termux."
  exit 0
fi

# Native RakNet backend provides full RakNet 11 + security cookie + MTU negotiation support for Bedrock servers (e.g. FreshSMP, DonutSMP).
# Disabled by default on Termux to prevent multi-minute clang/cmake build stalls; set PEBBLEAFK_BUILD_NATIVE=true to opt in.
if [ "${PEBBLEAFK_BUILD_NATIVE:-${VISTAAFK_BUILD_NATIVE:-false}}" != "true" ]; then
  echo "ℹ️ Using pure JavaScript RakNet transport for Termux (instant start)."
  exit 0
fi

echo "📦 Preparing native RakNet backend for Termux (one-time build for FreshSMP/Bedrock)..."
if ! command -v pkg >/dev/null 2>&1; then
  exit 0
fi

pkg install -y cmake clang make git python nodejs-lts || {
  echo "⚠️ Could not install native build tools; the daemon will use the JSP RakNet fallback."
  exit 0
}

export CC=clang
export CXX=clang++

# The daemon installs dependencies with lifecycle scripts disabled for Android.
# Install the native package if a lockfile/install variation left it out.
if [ ! -f "node_modules/raknet-native/buildChecks.js" ]; then
  echo "📦 Installing raknet-native package..."
  npm install --no-save --package-lock=false --ignore-scripts raknet-native@1.2.3 || {
    echo "⚠️ Could not install raknet-native; the daemon will use the JSP RakNet fallback."
    exit 0
  }
fi

node ./scripts/patch-termux-raknet-native.cjs || {
  echo "⚠️ Could not patch native RakNet for Termux; the daemon will use the JSP RakNet fallback."
  exit 0
}

node ./scripts/patch-termux-node-addon-api.cjs || {
  echo "⚠️ Could not patch node-addon-api for Termux; the daemon will use the JSP RakNet fallback."
  exit 0
}

CMAKE_JS_BIN=""
if [ -f "node_modules/cmake-js/bin/cmake-js" ]; then
  CMAKE_JS_BIN="$PWD/node_modules/cmake-js/bin/cmake-js"
elif [ -f "node_modules/raknet-native/node_modules/cmake-js/bin/cmake-js" ]; then
  CMAKE_JS_BIN="$PWD/node_modules/raknet-native/node_modules/cmake-js/bin/cmake-js"
elif command -v cmake-js >/dev/null 2>&1; then
  CMAKE_JS_BIN="$(command -v cmake-js)"
fi

if [ -z "$CMAKE_JS_BIN" ]; then
  echo "📦 Installing cmake-js build helper..."
  npm install --no-save --package-lock=false cmake-js >/dev/null 2>&1 || true
  if [ -f "node_modules/cmake-js/bin/cmake-js" ]; then
    CMAKE_JS_BIN="$PWD/node_modules/cmake-js/bin/cmake-js"
  fi
fi

if [ -z "$CMAKE_JS_BIN" ]; then
  echo "⚠️ cmake-js is unavailable; the daemon will use the JSP RakNet fallback."
  exit 0
fi

if [ ! -d "node_modules/raknet-native/raknet/Source" ]; then
  echo "📥 Fetching RakNet native source for the Android build..."
  rm -rf node_modules/raknet-native/raknet 2>/dev/null || true
  git clone --depth 1 https://github.com/extremeheat/fb-raknet node_modules/raknet-native/raknet || {
    echo "⚠️ Could not fetch RakNet native source; the daemon will use the JSP RakNet fallback."
    exit 0
  }
fi

echo "⚙️ Compiling native RakNet for Termux..."
(cd node_modules/raknet-native && node "$CMAKE_JS_BIN" compile) || {
  echo "⚠️ Native RakNet build failed; the daemon will use the JSP RakNet fallback."
  exit 0
}

if node -e "require('raknet-native')" >/dev/null 2>&1; then
  echo "✅ Native RakNet compiled successfully and is ready for Termux."
else
  echo "⚠️ Native RakNet did not load after compilation; the daemon will use the JSP RakNet fallback."
fi

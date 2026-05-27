#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

ARG1=${1:-}
ARG2=${2:-}
ARG3=${3:-}
VERSION=
PLATFORMS=${PLATFORMS:-all}
URL_BASE=${URL_BASE:-}
OUT_DIR=${OUT_DIR:-lib/EasyInk.Render/releases}
DOCKER_IMAGE=${DOCKER_IMAGE:-golang:1.23-bookworm}
DOCKER_PLATFORM=${DOCKER_PLATFORM:-linux/amd64}

if [ -n "$ARG1" ]; then
  case "$ARG1" in
    [0-9]*.[0-9]*.[0-9]*)
      VERSION=$ARG1
      [ -n "$ARG2" ] && PLATFORMS=$ARG2
      [ -n "$ARG3" ] && URL_BASE=$ARG3
      ;;
    *)
      PLATFORMS=$ARG1
      [ -n "$ARG2" ] && URL_BASE=$ARG2
      ;;
  esac
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker and make sure docker is on PATH." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install dependencies before building Render packages." >&2
  exit 1
fi

cd "$REPO_ROOT"

echo "Building EasyInk.Render viewer runtime..."
pnpm render:runtime
pnpm render:manifest

echo "Building EasyInk.Render host packages with Docker..."
echo "Platforms: $PLATFORMS"
echo "Docker image: $DOCKER_IMAGE"
echo "Docker platform: $DOCKER_PLATFORM"
[ -n "$VERSION" ] && echo "Version: $VERSION"

set -- build-host-matrix \
  --platforms "$PLATFORMS" \
  --outDir "$OUT_DIR" \
  --docker true \
  --dockerImage "$DOCKER_IMAGE" \
  --dockerPlatform "$DOCKER_PLATFORM"

if [ -n "$VERSION" ]; then
  set -- "$@" --version "$VERSION"
fi

if [ -n "$URL_BASE" ]; then
  set -- "$@" --urlBase "$URL_BASE"
fi

pnpm exec node lib/EasyInk.Render/tools/render-release.mjs "$@"

echo
echo "Done: $OUT_DIR/host"

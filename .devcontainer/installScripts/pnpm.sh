#!/bin/bash
set -eu
corepack enable pnpm
corepack prepare pnpm@latest --activate
pnpm --version
#!/bin/bash
apt-get update && apt-get install -y \
  git \
  && rm -rf /var/lib/apt/lists/*

git config --system --add safe.directory '*'

curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.deb.sh | bash

apt-get install git-lfs

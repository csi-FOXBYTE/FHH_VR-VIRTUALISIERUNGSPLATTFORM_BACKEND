FROM node:23-slim

ENV DEBIAN_FRONTEND=noninteractive

COPY .devcontainer/installScripts/ /tmp/installScripts/

# Make scripts executable, run in sorted order, then clean up
RUN set -eux; \
  find /tmp/installScripts -type f -name '*.sh' -print0 \
  | sort -z \
  | xargs -r -0 -I{} bash -lc 'f="{}"; sed -i "s/\r$//" "$f" || true; chmod +x "$f"; echo "Running $f"; bash "$f"'; \
  rm -rf /tmp/installScripts

# Allow git to work inside workspace

WORKDIR /workspace

FROM cloudflare/sandbox:0.13.0-next.738.2@sha256:f4b2137219568aa44539ab93c0e774db6bcab323c134c5088447916e58f15e75

USER root

COPY --from=ghcr.io/astral-sh/uv:0.12.14@sha256:1946145b8706ad9e5c0e79a513f9e324b58d5e38126bb2c8b7dbfca61febeb45 /uv /usr/local/bin/uv

# The repository requires Python >=3.11. Install outside /root so checked
# commands running as deos-author use the same interpreter as image checks.
RUN UV_PYTHON_INSTALL_DIR=/opt/deos-python UV_PYTHON_BIN_DIR=/usr/local/bin \
      uv python install 3.11.16 --default \
    && python3 -m venv /opt/deos-tools \
    && /opt/deos-tools/bin/pip install --no-cache-dir showboat==0.6.1 \
    && ln -s /opt/deos-tools/bin/showboat /usr/local/bin/showboat \
    && python3 -c 'from datetime import UTC; import sys; assert sys.version_info[:3] == (3, 11, 16)'

RUN useradd --create-home --shell /bin/bash deos-author

RUN npm install --global --omit=dev @openai/codex@0.147.0 @fission-ai/openspec@1.8.0 @anthropic-ai/claude-code@2.1.268 wrangler@4.125.0

RUN mkdir -p /deos/bin /deos/shared /deos/staging /deos/jobs /deos/auth /deos/bettaview \
    && chmod 700 /deos/auth \
    && chmod 755 /deos/bin /deos/shared /deos/staging /deos/jobs

COPY container/claude-*.mjs /deos/bin/
COPY src/claude-review.ts /deos/bin/claude-review.ts
COPY src/claude-diagnostics.ts src/error-details.ts /deos/bin/

COPY container/original-errors.mjs /deos/bin/original-errors.mjs
COPY container/native-review-packet.mjs /deos/bin/native-review-packet.mjs
COPY container/native-review-read.mjs /deos/bin/native-review-read.mjs
COPY container/native-review-adapter.mjs /deos/bin/native-review-adapter.mjs
COPY container/native-self-review.mjs /deos/bin/native-self-review.mjs
COPY container/bounded-*.mjs /deos/bin/
COPY container/grounded-*.mjs /deos/bin/
COPY vendor/agent-skills/ /deos/agent-skills/
COPY container/native-review-setup.mjs /deos/bin/native-review-setup.mjs
COPY container/implementation-*.mjs /deos/bin/
COPY container/deos-implementation /usr/local/bin/deos-implementation
COPY container/supervisor.mjs /deos/bin/supervisor.mjs
COPY container/supervisor-io.mjs /deos/bin/supervisor-io.mjs
COPY container/attempt-completion.mjs /deos/bin/attempt-completion.mjs
COPY container/author-completion.mjs /deos/bin/author-completion.mjs
COPY container/trace-review-proof.mjs /deos/bin/trace-review-proof.mjs
COPY container/trace-review-runner.mjs /deos/bin/trace-review-runner.mjs
COPY container/design-review-runner.mjs /deos/bin/design-review-runner.mjs
COPY container/design-review-schema.mjs /deos/bin/design-review-schema.mjs
COPY container/patch-capture.mjs /deos/bin/patch-capture.mjs
COPY shared/planning-language.mjs /deos/shared/planning-language.mjs
COPY vendor/bettaview/ /deos/bettaview/
COPY config/schemas/trace-recheck-result-v1.json /deos/config/schemas/trace-recheck-result-v1.json
COPY config/prompts/openspec-traceability-recheck.md /deos/config/prompts/openspec-traceability-recheck.md
COPY container/deos-github /usr/local/bin/deos-github
COPY container/deos-linear /usr/local/bin/deos-linear

RUN chmod 755 /deos/bin/supervisor.mjs /deos/bin/author-completion.mjs /deos/bin/trace-review-runner.mjs \
      /deos/bin/design-review-runner.mjs \
      /usr/local/bin/deos-github /usr/local/bin/deos-linear /usr/local/bin/deos-implementation \
    && for file in /deos/bin/*.mjs; do node --check "$file" || exit 1; done \
    && claude --version \
    && codex --version \
    && openspec --version

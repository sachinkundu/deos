FROM cloudflare/sandbox:0.13.0-next.738.2@sha256:f4b2137219568aa44539ab93c0e774db6bcab323c134c5088447916e58f15e75

USER root

RUN npm install --global --omit=dev @openai/codex@0.147.0 @fission-ai/openspec@1.8.0

RUN mkdir -p /deos/bin /deos/shared /deos/staging /deos/jobs /deos/auth /deos/bettaview \
    && chmod 700 /deos/auth \
    && chmod 755 /deos/bin /deos/shared /deos/staging /deos/jobs

COPY container/supervisor.mjs /deos/bin/supervisor.mjs
COPY container/author-completion.mjs /deos/bin/author-completion.mjs
COPY container/trace-review-proof.mjs /deos/bin/trace-review-proof.mjs
COPY container/trace-review-runner.mjs /deos/bin/trace-review-runner.mjs
COPY container/patch-capture.mjs /deos/bin/patch-capture.mjs
COPY shared/planning-language.mjs /deos/shared/planning-language.mjs
COPY vendor/bettaview/ /deos/bettaview/
COPY config/schemas/trace-recheck-result-v1.json /deos/config/schemas/trace-recheck-result-v1.json
COPY config/prompts/openspec-traceability-recheck.md /deos/config/prompts/openspec-traceability-recheck.md
COPY container/deos-github /usr/local/bin/deos-github
COPY container/deos-linear /usr/local/bin/deos-linear

RUN chmod 755 /deos/bin/supervisor.mjs /deos/bin/author-completion.mjs /deos/bin/trace-review-runner.mjs \
      /usr/local/bin/deos-github /usr/local/bin/deos-linear \
    && codex --version \
    && openspec --version

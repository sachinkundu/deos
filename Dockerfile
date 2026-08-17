FROM cloudflare/sandbox:0.13.0-next.738.2@sha256:f4b2137219568aa44539ab93c0e774db6bcab323c134c5088447916e58f15e75

USER root

RUN npm install --global --omit=dev @openai/codex@0.147.0

RUN mkdir -p /deos/bin /deos/staging /deos/jobs /deos/auth \
    && chmod 700 /deos/auth \
    && chmod 755 /deos/bin /deos/staging /deos/jobs

COPY container/supervisor.mjs /deos/bin/supervisor.mjs
COPY container/deos-github /usr/local/bin/deos-github
COPY container/deos-linear /usr/local/bin/deos-linear

RUN chmod 755 /deos/bin/supervisor.mjs /usr/local/bin/deos-github /usr/local/bin/deos-linear \
    && codex --version

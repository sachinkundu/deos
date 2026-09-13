# Frozen agent skills

SAC-170 bundles the Cloudflare skill tree and the repository's OpenSpec apply and
review flow skills. These are the exact local skill sources used when the new
workflow version was prepared. The Cloudflare tree includes its referenced files.

`manifest.json` lists every file and SHA-256. Each skill's digest hashes the JSON
encoding of its ordered file manifest. `config/grounding-skills.json` and the v25
workflow definitions pin those bundle digests. Startup checks every file before
copying it into the native runtime's skill directory, then reads back the native
skill catalog. This README is outside the hashed skill trees.

Updates need a new bundle digest and frozen workflow version. Existing runs keep
their supplied policy. Skill text cannot grant provider rights or approve gates.

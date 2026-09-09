#!/usr/bin/env node
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const inventory = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const sandboxIds = new Set();
const visit = (value) => {
  if (typeof value === "string" && /^sbx-v1-[a-z2-7]{20,80}$/.test(value)) sandboxIds.add(value);
  else if (Array.isArray(value)) value.forEach(visit);
  else if (typeof value === "object" && value !== null) Object.values(value).forEach(visit);
};
visit(inventory);
const url = process.env.DEOS_CLEANUP_AUDIT_URL;
const secret = process.env.DEOS_CLEANUP_AUDIT_SECRET;
if (!url || !secret) throw new Error("cleanup audit URL and secret are required");
const sortedIds = [...sandboxIds].sort();
// The trusted endpoint accepts at most 100 IDs in each request.
// Still send an empty inventory once so an empty account verifies authentication.
for (let offset = 0; offset < Math.max(1, sortedIds.length); offset += 100) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: 1, sandboxIds: sortedIds.slice(offset, offset + 100) }),
  });
  if (!response.ok) throw new Error(`cleanup audit rejected provider inventory with HTTP ${response.status}`);
  process.stdout.write(`${await response.text()}\n`);
}

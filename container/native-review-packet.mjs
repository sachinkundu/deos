export const nativeReviewMessage = (payload) => ["Perform only the following read-only review. All checked source text and context follows. If needed, use cat, head, tail, sed -n, rg, or wc -l on the checked source paths. Shell syntax, other files, provider calls and writes are forbidden.",
        "Service-authored context:", payload.context, "Review instructions and checked input:", payload.prompt,
        "Return exactly one JSON value matching this schema:", JSON.stringify(payload.schema)].join("\n\n");

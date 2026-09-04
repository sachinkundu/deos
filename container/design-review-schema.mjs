export const designReviewOutputSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["version", "inputSha256", "phase", "outcome", "summary", "findings"],
  properties: {
    version: { type: "integer", const: 1 },
    inputSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    phase: { type: "string", enum: ["self", "independent"] },
    outcome: { type: "string", enum: ["pass", "concerns"] },
    summary: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "severity", "category", "message", "sourceRanges"],
        properties: {
          id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          category: {
            type: "string",
            enum: ["correctness", "completeness", "consistency", "security", "operability"],
          },
          message: { type: "string", minLength: 1 },
          sourceRanges: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path", "startLine", "endLine"],
              properties: {
                path: { type: "string" },
                startLine: { type: "integer", minimum: 1 },
                endLine: { type: "integer", minimum: 1 },
              },
            },
          },
        },
      },
    },
  },
});

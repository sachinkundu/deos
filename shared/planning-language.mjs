export const MINIMUM_FLESCH_READING_EASE = 70;
export const MAXIMUM_FLESCH_KINCAID_GRADE = 8;

const normalize = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

export const readabilityWords = (value) => normalize(value).split(" ").filter(Boolean);

export const proseForReadability = (value) => {
  let inCodeBlock = false;
  const prose = [];
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (
      inCodeBlock || trimmed.length === 0 || trimmed.startsWith("#") ||
      trimmed.startsWith("flowchart ") || trimmed.startsWith("stateDiagram") ||
      trimmed.startsWith("|") || trimmed.startsWith("%%")
    ) continue;
    prose.push(trimmed
      .replace(/https?:\/\/\S+/g, "")
      .replace(/`[^`]+`/g, "")
      .replace(/\b[a-f0-9]{16,}\b/gi, "")
      .replace(/\b[A-Z][A-Z0-9]+-[0-9]+\b/g, "")
      .replace(/(?:^|\s)(?:[./]|[a-z0-9_-]+\/)[^\s]+/gi, " ")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, ""));
  }
  return prose.join(" ");
};

const syllables = (word) => {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.length <= 3) return 1;
  const withoutSilentE = normalized.replace(/(?:[^l]e|ed|es)$/, "");
  const groups = withoutSilentE.match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, groups);
};

export const scoreReadability = (value) => {
  const tokens = readabilityWords(value);
  const sentenceCount = Math.max(1, value.split(/[.!?]+/).filter((part) => part.trim().length > 0).length);
  const syllableCount = tokens.reduce((total, token) => total + syllables(token), 0);
  const perSentence = tokens.length / sentenceCount;
  const perWord = syllableCount / Math.max(1, tokens.length);
  return {
    fleschReadingEase: Number((206.835 - 1.015 * perSentence - 84.6 * perWord).toFixed(2)),
    fleschKincaidGrade: Number((0.39 * perSentence + 11.8 * perWord - 15.59).toFixed(2)),
  };
};

export const readabilityPassed = (score) =>
  score.fleschReadingEase >= MINIMUM_FLESCH_READING_EASE &&
  score.fleschKincaidGrade <= MAXIMUM_FLESCH_KINCAID_GRADE;

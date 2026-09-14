import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";

// Match the text a reader sees, while retaining the parser's source positions.
// Link destinations, emphasis delimiters, list numbering and HTML entities are
// Markdown syntax, not words selected in the rendered document.
function renderedProjection(source) {
  const tree = fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  let text = "";
  const starts = [], ends = [];
  function append(value, start, end) {
    text += value;
    for (const character of value) {
      for (let i = 0; i < character.length; i++) { starts.push(start); ends.push(end); }
      if (character === "\n") start = Math.min(start + 1, end);
    }
  }
  function visit(node) {
    const start = node.position?.start.line || 1, end = node.position?.end.line || start;
    if (node.type === 'definition' || node.type === 'html') return;
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
      // Text node values retain newlines; map each line independently.
      const lines = node.value.split('\n');
      let line = start + (node.type === 'code' && /^ {0,3}(```|~~~)/.test(source.split('\n')[start - 1]) ? 1 : 0);
      for (let i = 0; i < lines.length; i++) {
        append(lines[i], line, node.type === 'inlineCode' ? end : line);
        if (i < lines.length - 1) { append('\n', line, line); line++; }
      }
    } else if (node.type === 'break') append('\n', start, end);
    else if (node.type === 'image' || node.type === 'imageReference') return;
    else if (node.children) {
      for (const child of node.children) visit(child);
    }
    if (['paragraph', 'heading', 'listItem', 'code', 'tableCell', 'tableRow', 'blockquote'].includes(node.type)) append('\n', end, end);
  }
  visit(tree);
  return { text, starts, ends };
}

function normalizedWithOffsets(value) {
  let normalized = "";
  const offsets = [];
  let inWhitespace = false;
  for (let index = 0; index < value.length; index += 1) {
    if (/\s/.test(value[index])) {
      if (!inWhitespace && normalized.length > 0) {
        normalized += " ";
        offsets.push(index);
      }
      inWhitespace = true;
      continue;
    }
    inWhitespace = false;
    normalized += value[index];
    offsets.push(index);
  }
  return { normalized: normalized.trim(), offsets };
}

function lineAtOffset(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function wordTokensWithOffsets(value) {
  return [...value.matchAll(/[\p{L}\p{N}_]+/gu)].map((match) => ({
    value: match[0].toLocaleLowerCase(),
    offset: match.index,
    length: match[0].length,
  }));
}

function preferredMatch(source, matches, preferredRange) {
  if (matches.length <= 1) return matches[0] || null;
  if (!preferredRange?.startLine || !preferredRange?.endLine) return null;
  const withinRange = matches.filter((match) => {
    const startLine = lineAtOffset(source, match.startOffset);
    const endLine = lineAtOffset(source, match.endOffset);
    return startLine <= preferredRange.endLine && endLine >= preferredRange.startLine;
  });
  return withinRange.length === 1 ? withinRange[0] : null;
}

function locateSelectedWords(source, selectedText, preferredRange) {
  const needle = wordTokensWithOffsets(selectedText);
  if (!needle.length) return null;
  const haystack = wordTokensWithOffsets(source);
  const matches = [];
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, tokenIndex) => token.value === haystack[index + tokenIndex].value)) {
      const first = haystack[index];
      const last = haystack[index + needle.length - 1];
      matches.push({ startOffset: first.offset, endOffset: last.offset + last.length - 1 });
    }
  }
  const match = preferredMatch(source, matches, preferredRange);
  if (!match && matches.length) throw new Error("That selection is ambiguous. Select a longer, unique passage.");
  return match;
}

export function locateSelectedText(source, selectedText, preferredRange) {
  const needle = normalizedWithOffsets(selectedText).normalized;
  if (!needle || needle.length < 3) throw new Error("Select at least three visible characters.");
  const rendered = renderedProjection(source);
  const projected = normalizedWithOffsets(rendered.text);
  const renderedMatches = [];
  for (let index = projected.normalized.indexOf(needle); index >= 0; index = projected.normalized.indexOf(needle, index + 1)) {
    const first = projected.offsets[index], last = projected.offsets[index + needle.length - 1];
    renderedMatches.push({ startLine: rendered.starts[first], endLine: rendered.ends[last] });
  }
  const candidates = renderedMatches.length > 1 && preferredRange?.startLine && preferredRange?.endLine
    ? renderedMatches.filter(range => range.startLine <= preferredRange.endLine && range.endLine >= preferredRange.startLine)
    : renderedMatches;
  if (candidates.length === 1) return { ...candidates[0], selectedText: needle };
  if (renderedMatches.length) throw new Error("That selection is ambiguous. Select a longer, unique passage.");

  // Keep compatibility with existing drafts that contain raw code or punctuation
  // transformed by GitHub's renderer. Never accept the supplied line range alone.
  const haystack = normalizedWithOffsets(source);
  const exactMatches = [];
  for (let index = haystack.normalized.indexOf(needle); index >= 0; index = haystack.normalized.indexOf(needle, index + 1)) {
    exactMatches.push({ startOffset: haystack.offsets[index], endOffset: haystack.offsets[index + needle.length - 1] });
  }
  const exact = preferredMatch(source, exactMatches, preferredRange);
  if (!exact && exactMatches.length) throw new Error("That selection is ambiguous. Select a longer, unique passage.");
  const match = exact || locateSelectedWords(source, selectedText, preferredRange);
  if (!match) throw new Error("Could not locate this selection in the Markdown source. Select a longer passage.");
  return {
    startLine: lineAtOffset(source, match.startOffset),
    endLine: lineAtOffset(source, match.endOffset),
    selectedText: needle,
  };
}


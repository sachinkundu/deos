export interface ReadabilityScore {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
}

export const MINIMUM_FLESCH_READING_EASE: 70;
export const MAXIMUM_FLESCH_KINCAID_GRADE: 8;
export function readabilityWords(value: string): string[];
export function proseForReadability(value: string): string;
export function scoreReadability(value: string): ReadabilityScore;
export function readabilityPassed(score: ReadabilityScore): boolean;

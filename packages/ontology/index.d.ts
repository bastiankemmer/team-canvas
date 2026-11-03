export type Fact = {
  id: string;
  subject: string;
  claim: string;
  area: string;
  heading: string;
};

export function extractFacts(source: string): Fact[];
export function render(fact: Fact): string;
/** Turtle for every literal fact in this one canvas, in document order. "" when it has none. */
export function readFacts(source: string): string;
export function collect(sources: readonly string[], factId: string): string;
export function collectBySubject(sources: readonly string[], subject: string): string;
/** Facts at or above the threshold inside these sources. Rare tokens in that set rank higher. Score descending, then id ascending. "" when none qualify. */
export function collectByQuery(sources: readonly string[], query: string, threshold: number): string;

/** Token counts. A string is a question. A Fact uses subject, heading, claim, id, and area. */
export function vector(input: string | Fact): Array<[string, number]>;
/**
 * Cosine in [0, 1]. Empty tokens score 0.
 * With `facts`, each token is weighted by ln(N/df) over that list. A token in every fact weighs 0. Question tokens missing from the list are ignored. One fact keeps raw counts.
 */
export function score(question: string, fact: Fact, facts?: readonly Fact[]): number;

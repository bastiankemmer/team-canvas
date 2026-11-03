export type Fact = {
  id: string;
  subject: string;
  claim: string;
  area: string;
  heading: string;
};

export function extractFacts(source: string): Fact[];
export function render(fact: Fact): string;
export function collect(sources: readonly string[], factId: string): string;
export function collectBySubject(sources: readonly string[], subject: string): string;
/** Facts with `score(query, fact)` at or above the threshold. Score descending, then id ascending. "" when none qualify. */
export function collectByQuery(sources: readonly string[], query: string, threshold: number): string;

/** Token counts. A string is a question. A Fact uses subject, heading, claim, id, and area. */
export function vector(input: string | Fact): Array<[string, number]>;
/** Cosine of `vector(question)` and `vector(fact)`, in [0, 1]. Empty tokens score 0. */
export function score(question: string, fact: Fact): number;

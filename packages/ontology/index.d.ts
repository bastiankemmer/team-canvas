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

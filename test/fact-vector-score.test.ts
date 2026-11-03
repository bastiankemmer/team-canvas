import { existsSync } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as ai from "../packages/ai/index.js";
import * as human from "../packages/human/index.ts";
import { collectByQuery, extractFacts, score, vector, type Fact } from "../packages/ontology/index.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";

const cube: Fact = {
  id: "cube",
  subject: "red",
  heading: "green",
  claim: "blue",
  area: "sphere",
};

const uxClaim: Fact = {
  id: "qqqq",
  subject: "qqqq",
  heading: "qqqq",
  claim: "ux-design",
  area: "qqqq",
};

function only(field: "subject" | "heading" | "claim" | "id" | "area", token: string): Fact {
  return {
    id: "qqqq",
    subject: "qqqq",
    heading: "qqqq",
    claim: "qqqq",
    area: "qqqq",
    [field]: token,
  };
}

describe("fact vector score", () => {
  it("turns a question and a Fact into the same token vector and a cosine in 0 to 1, so a hyphen splits, an exact token match is 1, and an empty question stays 0 without a model, a vector file, or a markdown write", async () => {
    const hyphen = vector("ux-design");
    const spaced = vector("ux design");
    const cased = vector("UX Design");
    expect(hyphen).toEqual(spaced);
    expect(spaced).toEqual(cased);
    expect(hyphen).toEqual([
      ["ux", 1],
      ["design", 1],
    ]);

    const uxDesign = score("ux design", uxClaim);
    const ux = score("ux", uxClaim);
    const design = score("design", uxClaim);
    expect(uxDesign).toBeGreaterThan(0);
    expect(ux).toBeGreaterThan(0);
    expect(design).toBeGreaterThan(0);

    const query = "red green blue cube sphere";
    const first = { question: vector(query), fact: vector(cube), score: score(query, cube) };
    const second = { question: vector(query), fact: vector(cube), score: score(query, cube) };
    expect(first.fact).toEqual(first.question);
    expect(first.score).toBe(1);
    expect(second).toEqual(first);

    expect(score("subjecttoken", only("subject", "subjecttoken"))).toBeGreaterThan(0);
    expect(score("headingtoken", only("heading", "headingtoken"))).toBeGreaterThan(0);
    expect(score("claimtoken", only("claim", "claimtoken"))).toBeGreaterThan(0);
    expect(score("idtoken", only("id", "idtoken"))).toBeGreaterThan(0);
    expect(score("areatoken", only("area", "areatoken"))).toBeGreaterThan(0);

    const none = score("ux design", {
      id: "qqqq",
      subject: "billing",
      heading: "billing",
      claim: "invoice",
      area: "qqqq",
    });
    expect(none).toBe(0);
    expect(score("", cube)).toBe(0);
    expect(score("---", cube)).toBe(0);
    expect(vector("")).toEqual([]);
    expect(vector("---")).toEqual([]);

    for (const value of [uxDesign, ux, design, first.score, none, score("", cube), score("---", cube)]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(Number.isNaN(value)).toBe(false);
    }

    expect(human).not.toHaveProperty("vector");
    expect(human).not.toHaveProperty("score");
    expect(ai).not.toHaveProperty("projectCanvas");

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-vector-"));
    const store = LocalFilesystemCanvasStore(root);
    await store.writeSource("notes/demo", "export default function Demo() { return null }\n");
    const written = (await readdir(root, { recursive: true })).map((entry) => entry.toString());
    expect(written.some((name) => name.endsWith(".md"))).toBe(false);
    expect(written.some((name) => name.endsWith(".vectors.json"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), ".vectors.json"))).toBe(false);
    expect(existsSync(path.join(root, ".vectors.json"))).toBe(false);
  });

  it("scores a repeated token and the cube fact as 1, a one-token overlap strictly between 0 and 1, and two empty bags as 0, so dividing a count cannot pass as a match and an empty fact cannot become NaN", () => {
    const blank: Fact = { id: "---", subject: "---", heading: "---", claim: "---", area: "---" };
    const doubled: Fact = { id: "---", subject: "red", heading: "---", claim: "red", area: "---" };
    const overlap = score("red", cube);

    expect(score("", blank)).toBe(0);
    expect(score("red", blank)).toBe(0);
    expect(score("red red", doubled)).toBe(1);
    expect(score("red green blue cube sphere", cube)).toBe(1);
    expect(overlap).toBeGreaterThan(0);
    expect(overlap).toBeLessThan(1);
    for (const value of [score("", blank), score("red", blank), score("red red", doubled), overlap]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  it("ranks a rare word above a word that is in every fact, so a long question still finds the distinctive claim", () => {
    const canvas = (id: string, claim: string) =>
      [
        'import { Fact } from "team-canvas/canvas";',
        "export default function Note() {",
        `  return <Fact id="${id}" subject="note" heading="note" claim="${claim}" area="proj/note" />;`,
        "}",
        "",
      ].join("\n");
    const sources = [
      canvas("rare", "lease canvas"),
      canvas("common", "canvas canvas canvas canvas"),
      canvas("also", "canvas"),
      canvas("more", "canvas"),
      canvas("rest", "canvas"),
    ];
    const query = "lease canvas canvas canvas";
    const facts = sources.flatMap((source) => extractFacts(source));
    const byId = (id: string) => {
      const found = facts.find((fact) => fact.id === id);
      if (!found) throw new Error(id);
      return found;
    };
    expect(score(query, byId("common"))).toBeGreaterThan(score(query, byId("rare")));
    const turtle = collectByQuery(sources, query, 0);
    const rareAt = turtle.indexOf("urn:team-canvas:fact:rare");
    const commonAt = turtle.indexOf("urn:team-canvas:fact:common");
    expect(rareAt).toBeGreaterThanOrEqual(0);
    expect(rareAt).toBeLessThan(commonAt);
    expect(score(query, byId("rare"), facts)).toBeGreaterThan(score(query, byId("common"), facts));
  });
});

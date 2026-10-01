/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  Button,
  Callout,
  CanvasLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Code,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  IconButton,
  Link,
  mergeStyle,
  Pill,
  Row,
  Select,
  Spacer,
  Stack,
  Stat,
  Swatch,
  Table,
  Text,
  TextArea,
  TextInput,
  TodoList,
  TodoListCard,
  Toggle,
  UsageBar,
} from "./index.js";
import * as barrel from "./index.js";

function render(node: ReactNode): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(node);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

/** Fixture canvas importing layout, forms, collapsible, swatch, todo, usage. */
function Task3Fixture() {
  return createElement(
    Stack,
    { gap: 12, style: mergeStyle({ padding: 8 }, { maxWidth: 640 }) },
    createElement(H1, null, "Task 3 fixture"),
    createElement(H2, null, "Layout"),
    createElement(H3, null, "Nested"),
    createElement(
      Row,
      { gap: 8, align: "center" },
      createElement(Text, null, "Hello ", createElement(Code, null, "world")),
      createElement(Link, { href: "https://example.com" }, "docs"),
      createElement(Spacer),
      createElement(Button, { variant: "primary" }, "Save"),
      createElement(Pill, { active: true }, "Active"),
      createElement(Stat, { value: "3", label: "Items", tone: "info" }),
    ),
    createElement(
      Grid,
      { columns: 2, gap: 8 },
      createElement(
        Card,
        null,
        createElement(CardHeader, { trailing: createElement(Pill, { size: "sm" }, "ok") }, "card"),
        createElement(CardBody, null, createElement(Text, { tone: "secondary" }, "body")),
      ),
      createElement(Callout, { tone: "warning", title: "Note" }, "Heads up"),
    ),
    createElement(Divider),
    createElement(Table, {
      headers: ["A", "B"],
      rows: [["1", "2"]],
      columnAlign: ["left", "right"],
      rowTone: ["success"],
    }),
    createElement(TextInput, { value: "name", onChange: () => {}, placeholder: "Name" }),
    createElement(TextArea, { value: "notes", onChange: () => {}, rows: 2 }),
    createElement(Checkbox, { checked: true, onChange: () => {}, label: "Agree" }),
    createElement(Toggle, { checked: false, onChange: () => {} }),
    createElement(Select, {
      value: "a",
      onChange: () => {},
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    }),
    createElement(IconButton, { title: "Close" }, "×"),
    createElement(
      CollapsibleSection,
      {
        title: "Tools",
        count: 1,
        leading: createElement(Swatch, { color: "purple" }),
        defaultOpen: true,
      },
      createElement(Text, { size: "small" }, "nested"),
    ),
    createElement(TodoList, {
      todos: [
        { id: "1", content: "Ship SDK", status: "in_progress" },
        { id: "2", content: "Done item", status: "completed" },
      ],
    }),
    createElement(TodoListCard, {
      todos: [{ id: "3", content: "Card todo", status: "pending" }],
      defaultExpanded: true,
    }),
    createElement(UsageBar, {
      total: 100,
      topLeftLabel: "40%",
      topRightLabel: "40 / 100",
      segments: [
        { id: "a", value: 25, color: "blue" },
        { id: "b", value: 15, color: "green" },
      ],
    }),
  );
}

describe("SDK UI / forms / misc", () => {
  it('@task-1: the anchor href is "/canvas/billing", the text is "billing", there is no target or rel, color and underline match Link then style, spaces encode, unsafe ids still render, and https Link opens in a new tab', () => {
    expect(barrel.CanvasLink).toBeTypeOf("function");

    const { container, unmount } = render(
      createElement(
        "div",
        null,
        createElement(CanvasLink, { to: "billing" }, "billing"),
        createElement(
          CanvasLink,
          { to: "bill ing", style: { color: "rgb(1, 2, 3)" } },
          "x",
        ),
        createElement(CanvasLink, { to: "../x" }, "unsafe"),
        createElement(Link, { href: "https://example.com" }, "docs"),
      ),
    );

    const billing = container.querySelector('a[href="/canvas/billing"]');
    expect(billing).not.toBeNull();
    expect(billing?.textContent).toBe("billing");
    expect(billing?.getAttribute("target")).toBeNull();
    expect(billing?.getAttribute("rel")).toBeNull();

    const spaced = container.querySelector('a[href="/canvas/bill%20ing"]');
    expect(spaced).not.toBeNull();
    expect(spaced?.textContent).toBe("x");
    expect(spaced?.getAttribute("target")).toBeNull();
    expect(spaced?.getAttribute("rel")).toBeNull();

    const unsafe = container.querySelector('a[href="/canvas/..%2Fx"]');
    expect(unsafe).not.toBeNull();
    expect(unsafe?.textContent).toBe("unsafe");

    const external = container.querySelector('a[href="https://example.com"]');
    expect(external?.getAttribute("target")).toBe("_blank");
    expect(external?.getAttribute("rel")).toBe("noopener noreferrer");

    const billingStyle = (billing as HTMLElement).style;
    const linkStyle = (external as HTMLElement).style;
    expect(billingStyle.color).toBe(linkStyle.color);
    expect(billingStyle.color).not.toBe("");
    expect(billingStyle.textDecoration).toBe("underline");
    expect(linkStyle.textDecoration).toBe("underline");

    const spacedStyle = (spaced as HTMLElement).style;
    expect(spacedStyle.color).toBe("rgb(1, 2, 3)");
    expect(spacedStyle.textDecoration).toBe("underline");

    unmount();
  });

  it("@task-3: layout, forms, collapsible, swatch, todo, and usage primitives render without error", () => {
    const { container, unmount } = render(createElement(Task3Fixture));

    expect(container.textContent).toContain("Task 3 fixture");
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("world");
    expect(container.textContent).toContain("docs");
    expect(container.textContent).toContain("Save");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("Items");
    expect(container.textContent).toContain("card");
    expect(container.textContent).toContain("Heads up");
    expect(container.textContent).toContain("Agree");
    expect(container.textContent).toContain("Tools");
    expect(container.textContent).toContain("Ship SDK");
    expect(container.textContent).toContain("Card todo");
    expect(container.textContent).toContain("40%");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector('input[type="text"]')).not.toBeNull();
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.querySelector('button[role="switch"]')).not.toBeNull();
    expect(container.querySelector("select")).not.toBeNull();
    expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(container.querySelector("hr")).not.toBeNull();

    expect(mergeStyle({ padding: 8 }, { maxWidth: 640 })).toEqual({
      padding: 8,
      maxWidth: 640,
    });

    for (const name of [
      "Stack",
      "Row",
      "Grid",
      "Card",
      "CardHeader",
      "CardBody",
      "Table",
      "Text",
      "H1",
      "H2",
      "H3",
      "Button",
      "Pill",
      "Stat",
      "Callout",
      "Code",
      "Link",
      "Divider",
      "Spacer",
      "mergeStyle",
      "TextInput",
      "TextArea",
      "Checkbox",
      "Toggle",
      "Select",
      "IconButton",
      "CollapsibleSection",
      "Swatch",
      "TodoList",
      "TodoListCard",
      "UsageBar",
    ] as const) {
      expect(barrel[name]).toBeTypeOf("function");
    }

    unmount();
  });
});

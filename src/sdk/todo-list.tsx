/** team-canvas SDK TodoList / TodoListCard. */
import { useState, type CSSProperties, type JSX } from "react";
import { useHostTheme } from "./hooks.js";
import { CanvasChevron, Card, CardBody } from "./ui-primitives.js";

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface TodoItem {
  readonly id: string;
  readonly content: string;
  readonly status: TodoStatus;
}

export type TodoListProps = {
  todos: readonly TodoItem[];
  dimmedTodoIds?: ReadonlySet<string>;
  onTodoClick?: (todo: TodoItem) => void;
  style?: CSSProperties;
};

const STATUS_GLYPH: Record<TodoStatus, string> = {
  pending: "○",
  in_progress: "◎",
  completed: "●",
  cancelled: "✕",
};

export function TodoList({
  todos,
  dimmedTodoIds,
  onTodoClick,
  style,
}: TodoListProps): JSX.Element | null {
  const theme = useHostTheme();
  if (todos.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, ...style }}>
      {todos.map((todo) => {
        const dimmed = dimmedTodoIds?.has(todo.id) ?? false;
        return (
          <button
            key={todo.id}
            type="button"
            onClick={() => onTodoClick?.(todo)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              width: "100%",
              boxSizing: "border-box",
              padding: "4px 6px",
              border: "none",
              borderRadius: 4,
              background: "transparent",
              color: dimmed ? theme.text.quaternary : theme.text.primary,
              font: "inherit",
              fontSize: 13,
              lineHeight: "18px",
              textAlign: "left",
              cursor: onTodoClick ? "pointer" : "default",
              opacity: dimmed ? 0.55 : 1,
              textDecoration:
                todo.status === "cancelled" ? "line-through" : undefined,
            }}
          >
            <span aria-hidden style={{ flexShrink: 0, width: 14 }}>
              {STATUS_GLYPH[todo.status]}
            </span>
            <span style={{ minWidth: 0, whiteSpace: "normal" }}>
              {todo.content}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type TodoListCardProps = {
  todos: readonly TodoItem[];
  dimmedTodoIds?: ReadonlySet<string>;
  defaultExpanded?: boolean;
  onTodoClick?: (todo: TodoItem) => void;
  style?: CSSProperties;
};

export function TodoListCard({
  todos,
  dimmedTodoIds,
  defaultExpanded = true,
  onTodoClick,
  style,
}: TodoListCardProps): JSX.Element | null {
  const theme = useHostTheme();
  const [open, setOpen] = useState(defaultExpanded);
  if (todos.length === 0) return null;

  const done = todos.filter(
    (t) => t.status === "completed" || t.status === "cancelled",
  ).length;

  return (
    <Card style={style}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          boxSizing: "border-box",
          minHeight: 28,
          padding: "6px 10px",
          border: "none",
          borderBottom: open
            ? `1px solid ${theme.stroke.tertiary}`
            : "none",
          background: "transparent",
          color: theme.text.primary,
          font: "inherit",
          fontSize: 12,
          lineHeight: "16px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <CanvasChevron expanded={open} />
        <span style={{ flex: 1 }}>
          {done} of {todos.length} Done
        </span>
      </button>
      {open ? (
        <CardBody style={{ padding: 8 }}>
          <TodoList
            todos={todos}
            dimmedTodoIds={dimmedTodoIds}
            onTodoClick={onTodoClick}
          />
        </CardBody>
      ) : null}
    </Card>
  );
}

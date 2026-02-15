/** Valid owner roles for ticket assignment. */
export const OWNERS = ["dev", "devops", "lead", "test"] as const;

/** Kanban stages with labels. */
export const STAGES = [
  { key: "backlog", label: "Backlog" },
  { key: "in-progress", label: "In Progress" },
  { key: "testing", label: "Testing" },
  { key: "done", label: "Done" },
] as const;

/** Kanban column config for Board: colKey maps to props, accent for styling. */
export const KANBAN_COLUMNS = [
  { colKey: "backlog", label: "Backlog", accent: "secondary" },
  { colKey: "inProgress", label: "In Progress", accent: "primary" },
  { colKey: "testing", label: "Testing", accent: "warning" },
  { colKey: "done", label: "Done", accent: "success" },
] as const;

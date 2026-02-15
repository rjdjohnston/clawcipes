export type Team = {
  teamId: string;
  recipeId: string;
  recipeName: string;
  scaffoldedAt: string;
};

export type Ticket = {
  stage: string;
  number: number | null;
  id: string;
  file: string;
  title?: string;
  owner?: string;
};

export type TicketsResponse = {
  teamId: string;
  tickets: Ticket[];
  backlog: Ticket[];
  inProgress: Ticket[];
  testing: Ticket[];
  done: Ticket[];
};

async function parseApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (typeof data?.error === "string") return data.error;
  } catch {
    /* not JSON */
  }
  return text;
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await fetch("/api/teams");
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export async function removeTeam(teamId: string): Promise<void> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function fetchTickets(teamId: string): Promise<TicketsResponse> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/tickets`);
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export async function moveTicket(
  teamId: string,
  ticketId: string,
  to: string,
  completed?: boolean
): Promise<void> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/tickets/${encodeURIComponent(ticketId)}/move`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, completed }),
    }
  );
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function assignTicket(
  teamId: string,
  ticketId: string,
  owner: string
): Promise<void> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/tickets/${encodeURIComponent(ticketId)}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner }),
    }
  );
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function takeTicket(
  teamId: string,
  ticketId: string,
  owner: string
): Promise<void> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/tickets/${encodeURIComponent(ticketId)}/take`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner }),
    }
  );
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function handoffTicket(teamId: string, ticketId: string, tester?: string): Promise<void> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/tickets/${encodeURIComponent(ticketId)}/handoff`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tester: tester ?? "test" }),
    }
  );
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function completeTicket(teamId: string, ticketId: string): Promise<void> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/tickets/${encodeURIComponent(ticketId)}/complete`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function dispatchTicket(
  teamId: string,
  request: string,
  owner?: string
): Promise<void> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request, owner: owner ?? "dev" }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export type InboxItem = {
  id: string;
  title?: string;
  received?: string;
};

export async function fetchInbox(teamId: string): Promise<InboxItem[]> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/inbox`);
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export async function fetchInboxContent(teamId: string, itemId: string): Promise<string> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/inbox/${encodeURIComponent(itemId)}/content`
  );
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  return data.content;
}

export async function fetchTicketContent(teamId: string, ticketId: string): Promise<string> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/tickets/${encodeURIComponent(ticketId)}/content`
  );
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  return data.content;
}

export type Recipe = {
  id: string;
  name?: string;
  kind?: string;
  source: string;
};

export async function fetchRecipes(): Promise<Recipe[]> {
  const res = await fetch("/api/recipes");
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export async function fetchRecipe(id: string): Promise<{ md: string }> {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export type RecipeStatus = {
  id: string;
  requiredSkills: string[];
  missingSkills: string[];
  installCommands: string[];
};

export async function fetchRecipeStatus(id?: string): Promise<RecipeStatus[]> {
  const url = id
    ? `/api/recipes/${encodeURIComponent(id)}/status`
    : "/api/recipes/status";
  const res = await fetch(url);
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

export async function scaffoldRecipeTeam(
  recipeId: string,
  teamId: string,
  overwrite?: boolean
): Promise<void> {
  const res = await fetch(
    `/api/recipes/${encodeURIComponent(recipeId)}/scaffold-team`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, overwrite }),
    }
  );
  if (!res.ok) throw new Error(await parseApiError(res));
}

export type Binding = {
  agentId: string;
  match: {
    channel: string;
    accountId?: string;
    guildId?: string;
    teamId?: string;
    peer?: { kind: string; id: string };
  };
};

export async function fetchBindings(): Promise<Binding[]> {
  const res = await fetch("/api/bindings");
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export async function addBindingAPI(
  agentId: string,
  match: Binding["match"]
): Promise<void> {
  const res = await fetch("/api/bindings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, match }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function removeBindingAPI(
  match: Binding["match"],
  agentId?: string
): Promise<void> {
  const res = await fetch("/api/bindings", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, match }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function fetchHealth(): Promise<{ ok: boolean; openclaw: boolean }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

/** Demo data for when running Kitchen without OpenClaw (e.g. standalone or plugin demo). */
export const DEMO_TEAM_ID = "demo-team";

export const DEMO_TEAMS: Team[] = [
  { teamId: DEMO_TEAM_ID, recipeId: "development-team", recipeName: "Development Team (demo)", scaffoldedAt: "" },
];

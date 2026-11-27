/**
 * Team hierarchy rules. Pure functions over a list of teams, so they are easy to test.
 *
 * A team has an optional manager and an optional parent team. A manager sees the records of their team
 * and every sub-team below it (see "team" data scope in permissions.ts).
 */

export interface TeamNode {
  id: number;
  parentTeamId: number | null;
  managerUserId: number | null;
}

/** Ids of every team the user manages, plus all teams below those. */
export function managedTeamIds(teams: TeamNode[], userId: number): number[] {
  const childrenOf = new Map<number, number[]>();
  for (const t of teams) {
    if (t.parentTeamId === null) continue;
    const list = childrenOf.get(t.parentTeamId) ?? [];
    list.push(t.id);
    childrenOf.set(t.parentTeamId, list);
  }

  const result = new Set<number>();
  const queue = teams.filter((t) => t.managerUserId === userId).map((t) => t.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (result.has(id)) continue; // guards against a cycle in bad data
    result.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return [...result];
}

/** True when making `newParentId` the parent of `teamId` would put the team under itself. */
export function wouldCreateCycle(
  teams: TeamNode[],
  teamId: number,
  newParentId: number | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === teamId) return true;
  const parentOf = new Map(teams.map((t) => [t.id, t.parentTeamId]));
  const seen = new Set<number>();
  let cursor: number | null | undefined = newParentId;
  while (cursor !== null && cursor !== undefined) {
    if (cursor === teamId) return true;
    if (seen.has(cursor)) return false; // existing bad data, not caused by this change
    seen.add(cursor);
    cursor = parentOf.get(cursor);
  }
  return false;
}

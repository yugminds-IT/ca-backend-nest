import { managedTeamIds, wouldCreateCycle, TeamNode } from './teams';

// Sales (1) has two sub-teams: North (2) and South (3). North has a sub-team, Metro (4).
const teams: TeamNode[] = [
  { id: 1, parentTeamId: null, managerUserId: 10 },
  { id: 2, parentTeamId: 1, managerUserId: 11 },
  { id: 3, parentTeamId: 1, managerUserId: null },
  { id: 4, parentTeamId: 2, managerUserId: 12 },
  { id: 5, parentTeamId: null, managerUserId: null },
];

describe('managedTeamIds', () => {
  it('includes every sub-team below a team the user manages', () => {
    expect(managedTeamIds(teams, 10).sort()).toEqual([1, 2, 3, 4]);
  });

  it('includes only the sub-tree of a lower manager', () => {
    expect(managedTeamIds(teams, 11).sort()).toEqual([2, 4]);
  });

  it('returns nothing for someone who manages no team', () => {
    expect(managedTeamIds(teams, 99)).toEqual([]);
    expect(managedTeamIds(teams, 10).includes(5)).toBe(false);
  });

  it('terminates on bad data where a team is its own ancestor', () => {
    const looped: TeamNode[] = [
      { id: 1, parentTeamId: 2, managerUserId: 7 },
      { id: 2, parentTeamId: 1, managerUserId: null },
    ];
    expect(managedTeamIds(looped, 7).sort()).toEqual([1, 2]);
  });
});

describe('wouldCreateCycle', () => {
  it('refuses a team as its own parent', () => {
    expect(wouldCreateCycle(teams, 2, 2)).toBe(true);
  });

  it('refuses moving a team under one of its own sub-teams', () => {
    expect(wouldCreateCycle(teams, 1, 4)).toBe(true);
  });

  it('allows moving a team under an unrelated team', () => {
    expect(wouldCreateCycle(teams, 3, 5)).toBe(false);
  });

  it('allows removing the parent', () => {
    expect(wouldCreateCycle(teams, 2, null)).toBe(false);
  });
});

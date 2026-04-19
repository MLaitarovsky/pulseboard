'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface Team {
  id: string;
  name: string;
  slug: string;
}

interface TeamContextValue {
  teams: Team[];
  teamId: string;
  team: Team | null;
  setTeamId: (slug: string) => void;
}

const STORAGE_KEY = 'pulseboard_team';
const DEFAULT_TEAM = 'acme-eng';

const TeamContext = createContext<TeamContextValue>({
  teams: [],
  teamId: DEFAULT_TEAM,
  team: null,
  setTeamId: () => {},
});

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_TEAM;
    }
    return DEFAULT_TEAM;
  });

  useEffect(() => {
    fetch('/api/teams')
      .then((r) => r.ok ? r.json() : [])
      .then((data: Team[]) => setTeams(data))
      .catch(() => {});
  }, []);

  function setTeamId(slug: string) {
    setTeamIdState(slug);
    localStorage.setItem(STORAGE_KEY, slug);
  }

  const team = teams.find((t) => t.slug === teamId) ?? null;

  return (
    <TeamContext.Provider value={{ teams, teamId, team, setTeamId }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}

export function useTeamId() {
  return useContext(TeamContext).teamId;
}

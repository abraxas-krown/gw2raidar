// The phase menu of an encounter, as breadcrumbs (helpers.phaseNav in frontend/assets/script.js).
// Phases can be nested (a boss phase made of smaller phases). The menu is {path, tabs}: the tabs are the phases
// of one level, and the path leads to that level from "All". A phase with parts, once chosen, joins the path and
// its parts become the tabs. At the top level there is no path, and "All" is the first tab.

export interface PhaseLink {
  name: string;
  duration: number;
  active: boolean;
  parts: boolean;
}

interface PhasedEncounter {
  phase_order?: string[];
  phase_parents?: Record<string, string | null>;
  phases: Record<string, { duration: number }>;
}

export function phaseNav(encounter: PhasedEncounter, selected: string): { path: PhaseLink[]; tabs: PhaseLink[] } {
  const parents = encounter.phase_parents || {};
  const phases = encounter.phase_order || Object.keys(encounter.phases);
  const children = (parent: string | null) =>
    phases.filter(name => name !== 'All' && (parents[name] || null) === parent);

  // the selected phase and the phases it is a part of, from the top level down
  const chain: string[] = [];
  for (let name: string | null | undefined = selected; name && name !== 'All' && chain.length < 10; name = parents[name]) {
    chain.unshift(name);
  }
  const hasParts = (name: string) => name !== 'All' && children(name).length > 0;

  let path: string[];
  let tabs: string[];
  if (hasParts(selected)) {
    path = chain;
    tabs = children(selected);
  } else {
    path = chain.slice(0, -1);
    tabs = path.length ? children(path[path.length - 1]) : ['All', ...children(null)];
  }
  if (path.length) path = ['All', ...path];

  const link = (name: string): PhaseLink => ({
    name,
    duration: encounter.phases[name]?.duration ?? 0,
    active: name === selected,
    parts: hasParts(name),
  });
  return { path: path.map(link), tabs: tabs.map(link) };
}

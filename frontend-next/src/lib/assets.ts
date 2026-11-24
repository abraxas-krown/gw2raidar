// URLs of the site's images (public/assets/img, served at /assets/img/ as the backend expects)
import type { Bootstrap } from '../api/types';

export const IMG = '/assets/img/';

export function specName(bootstrap: Bootstrap, profession: number | string, elite: number | string): string | undefined {
  return bootstrap.specialisations[String(profession)]?.[String(elite)];
}

export const specIcon = (spec: string | undefined, size: 20 | 48 | 120) =>
  `${IMG}${size}px/${spec}_tango_icon_${size}px.png`;

export const archetypeIcon = (archetype: string | undefined) => `${IMG}arch/${archetype}.png`;

export const encounterIcon = (icon: string | undefined) => `${IMG}icon/${icon}.png`;

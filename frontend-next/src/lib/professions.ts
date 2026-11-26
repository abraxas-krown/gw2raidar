// The professions' colours, by raidar's profession code (analyser.analyser.Profession), for anything drawn or
// styled per profession: the replay's minions, and later tables and charts.

export const PROFESSION_COLOURS: Record<number, string> = {
  1: '#72C1D9', // Guardian
  2: '#FFD166', // Warrior
  3: '#D09C59', // Engineer
  4: '#8CDC82', // Ranger
  5: '#C08F95', // Thief
  6: '#F68A87', // Elementalist
  7: '#B679D5', // Mesmer
  8: '#52A76F', // Necromancer
  9: '#D16E5A', // Revenant
};

// a profession's colour, or undefined for a code that is not one (the caller picks its own fallback)
export const professionColour = (profession: number | string | undefined): string | undefined =>
  profession === undefined ? undefined : PROFESSION_COLOURS[Number(profession)];

// Blue's hunting plans for mission 2. Each is a mission-1 console session; its `wait` lines make the timetable.
// Red does not know which one is running. The seed picks.

export interface Playbook {
  name: string;
  script: string;
}

export const PLAYBOOKS: Playbook[] = [
  {
    name: 'Line sweep',
    script: `
sq1: df e 10
sq2: df e 10
sq3: df e 10
uav: df e 10
wait 10
sq1: df se 10
sq3: df ne 10
sq2: df e 10
uav: df e 10
wait 10
sq1: df e 15
sq2: df e 15
sq3: df e 15
uav: df e 15
wait 15
sq1: df se 15
sq3: df ne 15
sq2: df e 15
wait 15
sq1: df e 10
sq2: df e 10
sq3: df e 10
wait 10
`,
  },
  {
    name: 'Sortie and squads',
    script: `
uav: sortie 125,72 e 3; 125,84 e 3
sq1: df se 12
sq3: df ne 12
wait 12
sq2: df e 10
sq1: df e 10
sq3: df e 10
wait 10
sq1: df se 10
sq3: df ne 10
sq2: df e 10
wait 8
uav: sortie 126,80 e 6
wait 12
sq1: df e 18
sq2: df e 18
sq3: df e 18
wait 18
`,
  },
  {
    name: 'Creep forward',
    script: `
sq1: df e 6
sq3: df e 6
wait 6
sq2: move 124,80
sq1: df se 8
sq3: df ne 8
wait 8
uav: df e 8
sq2: df e 8
sq1: df e 8
sq3: df e 8
wait 8
sq1: move 122,70
sq3: move 122,90
wait 8
sq1: df e 12
sq2: df e 12
sq3: df e 12
uav: df e 12
wait 12
sq1: df se 10
sq3: df ne 10
sq2: df e 10
uav: df e 10
wait 10
sq1: df e 8
sq2: df e 8
sq3: df e 8
wait 8
`,
  },
];

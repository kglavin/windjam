// The deception mission's traffic (docs/design-deception.md D5): each hour, every net whose profile says its hub
// sends an order puts an order burst on the air, and the members acknowledge in the same hour. A notional net has
// one transmitter, so its acknowledgements come from the hub itself, one after another: the tell a careful listener
// can hear. Chatter follows the profile's daily curve through dutyOf in mission.ts.
import type { MissionState } from './types';
import { orderDue } from './orbat';

export function trafficTick(s: MissionState, m: number): void {
  if (!s.profiles) return;
  for (const net of s.world.nets) {
    const profile = s.profiles[net.id];
    if (!profile || !net.hubId || !orderDue(profile, m)) continue;
    const hub = s.world.units.find((u) => u.id === net.hubId);
    if (!hub || hub.radio.powerW <= 0) continue;
    const members = net.memberIds.filter((id) => id !== net.hubId);
    s.bursts.push({ minute: m, unitId: hub.id, netId: net.id, what: 'order' });
    for (const id of members) {
      const u = s.world.units.find((x) => x.id === id);
      if (u && u.radio.powerW > 0) s.bursts.push({ minute: m, unitId: id, netId: net.id, what: 'ack' });
    }
    // A notional net's transmitter plays the stations it lacks: their acknowledgements, in turn, from where it stands.
    if (profile.notional) for (let k = 0; k < (profile.notionalMembers ?? 0); k++) s.bursts.push({ minute: m, unitId: hub.id, netId: net.id, what: `ack (station ${members.length + k + 1})` });
  }
}

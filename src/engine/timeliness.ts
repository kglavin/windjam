// Timeliness (notes section 1): jamming does not change what an order says, it delays it.
// BER -> packet error rate -> retransmissions (ARQ) -> time to deliver an order -> on time, late, or lost.

import type { DirectionBudget, LinkBudget } from './budget';
import type { Net } from './units';

export const PACKET_BITS = 1024; // 128-byte packets
export const MAX_TRANSMISSIONS = 8; // ARQ gives up after this many tries
export const TURNAROUND_S = 0.05; // ACK wait and radio turnaround per try
export const ORDER_PACKETS = 32; // a 4 KB order
export const ORDER_DEADLINE_S = 20; // the commander's decision window for one order

export type OrderStatus = 'on time' | 'late' | 'lost';

// Chance a packet of PACKET_BITS has at least one bit error, with no FEC.
export const packetErrorRate = (ber: number): number => 1 - (1 - ber) ** PACKET_BITS;

// Packet error rate for one direction. Each state keeps its own BER: averaging BER first would
// understate losses when jamming is all-or-nothing.
export function directionPer(d: DirectionBudget): number {
  return d.states.clear * packetErrorRate(d.berClear) + d.states.jammed * packetErrorRate(d.berJammed) + d.states.lost;
}

export interface HopDelivery {
  per: number; // worse direction: data one way, ACKs the other
  expectedTransmissions: number; // per packet, ARQ truncated at MAX_TRANSMISSIONS
  packetSuccess: number; // chance a packet gets through within MAX_TRANSMISSIONS
}

export function hopDelivery(b: LinkBudget): HopDelivery {
  const per = Math.max(directionPer(b.forward), directionPer(b.reverse));
  // Truncated geometric: E[tries] = (1 - p^M) / (1 - p); success = 1 - p^M.
  const expectedTransmissions = per >= 1 ? MAX_TRANSMISSIONS : (1 - per ** MAX_TRANSMISSIONS) / (1 - per);
  return { per, expectedTransmissions, packetSuccess: 1 - per ** MAX_TRANSMISSIONS };
}

export interface OrderDelivery {
  hops: HopDelivery[];
  deliveryProbability: number; // all ORDER_PACKETS through every hop
  latencyS: number; // expected time to send the whole order
  status: OrderStatus;
}

// Deliver one order over the hops of a route, store-and-forward.
export function orderDelivery(hops: LinkBudget[], net: Net): OrderDelivery {
  const packetTimeS = PACKET_BITS / (net.dataRateKbps * 1000) + TURNAROUND_S;
  const h = hops.map(hopDelivery);
  const deliveryProbability = h.reduce((p, x) => p * x.packetSuccess ** ORDER_PACKETS, 1);
  const latencyS = ORDER_PACKETS * h.reduce((s, x) => s + x.expectedTransmissions * packetTimeS, 0);
  const status: OrderStatus = deliveryProbability < 0.5 ? 'lost' : latencyS > ORDER_DEADLINE_S ? 'late' : 'on time';
  return { hops: h, deliveryProbability, latencyS, status };
}

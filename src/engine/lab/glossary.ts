// Glossary for the Link lab: a plain definition of each term, where a lesson teaches it, and a Wikipedia article to
// read more. Lesson texts mark terms as [[term]] or [[shown text|term]]; Rich (src/ui/lab/Rich.tsx) turns them into
// popups. The definitions use the lessons' own words and must stand alone: the link may not open on every network.

export interface GlossaryEntry {
  id: string;
  term: string; // as shown in the popup and the glossary page
  aliases?: string[]; // other spellings a [[...]] may use, lower case
  short: string;
  taught?: { level: number; step: string };
  wiki: string; // English Wikipedia article title, checked to exist (2026-10-18)
}

export const GLOSSARY: GlossaryEntry[] = [
  { id: 'transmitter', term: 'transmitter', short: 'The radio that turns a message into a radio wave and sends it from its antenna.', taught: { level: 0, step: 'A1' }, wiki: 'Transmitter' },
  { id: 'receiver', term: 'receiver', short: 'The radio that catches a little of a radio wave and turns it back into the message.', taught: { level: 0, step: 'A1' }, wiki: 'Radio receiver' },
  { id: 'intercept', term: 'intercept receiver', aliases: ['intercept'], short: 'Your own receiver in the lab. It listens to the enemy link without knowing its code, so it gets no processing gain and has to get close.', taught: { level: 1, step: 'B1' }, wiki: 'Electronic warfare support measures' },
  { id: 'antenna', term: 'antenna', short: 'The bridge between wires and air: it turns a current into a radio wave, and a wave back into a current.', taught: { level: 0, step: 'A1' }, wiki: 'Antenna (radio)' },
  { id: 'frequency', term: 'frequency', aliases: ['hz', 'khz', 'mhz', 'ghz', 'hertz'], short: 'How many cycles a wave makes each second, in hertz (Hz). 1 kHz is a thousand a second, 1 MHz a million.', taught: { level: 0, step: 'B1' }, wiki: 'Frequency' },
  { id: 'period', term: 'period', short: 'How long one cycle lasts: 1 ÷ frequency. At 1 MHz one cycle lasts 1 µs.', taught: { level: 0, step: 'B1' }, wiki: 'Frequency' },
  { id: 'wavelength', term: 'wavelength', short: 'How far a wave travels in one period: speed of light ÷ frequency. 1 m at 300 MHz.', taught: { level: 0, step: 'B1' }, wiki: 'Wavelength' },
  { id: 'carrier', term: 'carrier', short: 'The steady wave at one frequency that a transmitter changes to carry its message.', taught: { level: 0, step: 'C1' }, wiki: 'Carrier wave' },
  { id: 'bpsk', term: 'BPSK', aliases: ['psk', 'phase-shift keying'], short: 'Binary phase-shift keying: each bit is the carrier as it is (+1) or turned upside down (−1, a 180° shift).', taught: { level: 0, step: 'C1' }, wiki: 'Phase-shift keying' },
  { id: 'bit', term: 'bit', aliases: ['bits'], short: 'One piece of the message, a 1 or a 0. The lab sends it as +1 or −1.', taught: { level: 0, step: 'C1' }, wiki: 'Bit' },
  { id: 'spectrum', term: 'spectrum', aliases: ['spectra'], short: 'A plot of how much power a signal has at each frequency. On the lab\'s spectra 0 MHz is the carrier.', taught: { level: 0, step: 'D1' }, wiki: 'Spectral density' },
  { id: 'mixer', term: 'mixer', short: 'Multiplies a signal by a local oscillator\'s wave. Out come the difference and the sum of the two frequencies; a filter keeps one.', taught: { level: 0, step: 'D2' }, wiki: 'Frequency mixer' },
  { id: 'lo', term: 'local oscillator', aliases: ['lo'], short: 'The steady wave a mixer multiplies by to move a signal in frequency.', taught: { level: 0, step: 'D2' }, wiki: 'Local oscillator' },
  { id: 'if', term: 'IF', aliases: ['intermediate frequency'], short: 'Intermediate frequency: the lower frequency a receiver moves a signal to before working on it, such as 2 MHz.', taught: { level: 0, step: 'D2' }, wiki: 'Intermediate frequency' },
  { id: 'iq', term: 'I and Q', short: 'Two mixers 90° apart that move a signal all the way to 0 MHz, keeping what was above and below the carrier apart.', taught: { level: 0, step: 'D2' }, wiki: 'In-phase and quadrature components' },
  { id: 'db', term: 'dB', aliases: ['decibel', 'decibels'], short: 'Decibels: 10 × log10 of a power ratio. +3 dB doubles the power, +10 dB is ten times.', taught: { level: 0, step: 'E1' }, wiki: 'Decibel' },
  { id: 'dbm', term: 'dBm', short: 'A power compared with 1 milliwatt: 0 dBm = 1 mW, +30 dBm = 1 W, −30 dBm = 1 µW.', taught: { level: 0, step: 'E1' }, wiki: 'DBm' },
  { id: 'path-loss', term: 'path loss', short: 'How much weaker a signal gets on its way: 6 dB per doubling of distance in open space, 12 dB near the ground.', taught: { level: 0, step: 'F1' }, wiki: 'Free-space path loss' },
  { id: 'dbi', term: 'dBi', aliases: ['antenna gain'], short: 'Antenna gain compared with an antenna that sends equally in every direction. A dipole is about 2 dBi.', taught: { level: 0, step: 'F2' }, wiki: 'Gain (antenna)' },
  { id: 'dipole', term: 'dipole', short: 'A simple antenna: a rod in two halves. It sends all round, at right angles to the rod, about 2 dBi.', taught: { level: 0, step: 'F2' }, wiki: 'Dipole antenna' },
  { id: 'directional', term: 'directional antenna', aliases: ['yagi', 'beam'], short: 'An antenna that focuses its power into a beam: about 10 dBi for a small Yagi, 30 dBi or more for a dish.', taught: { level: 0, step: 'F2' }, wiki: 'Yagi–Uda antenna' },
  { id: 'lna', term: 'LNA', aliases: ['low-noise amplifier'], short: 'Low-noise amplifier: the receiver\'s first amplifier, which lifts the weak signal while adding as little noise as it can.', taught: { level: 0, step: 'G1' }, wiki: 'Low-noise amplifier' },
  { id: 'adc', term: 'ADC', aliases: ['analog-to-digital converter'], short: 'Analog-to-digital converter: turns a voltage into numbers for software to work on.', taught: { level: 0, step: 'G1' }, wiki: 'Analog-to-digital converter' },
  { id: 'dsp', term: 'DSP', aliases: ['digital signal processing'], short: 'Digital signal processing: software that filters, despreads and decides bits once the signal is numbers.', taught: { level: 0, step: 'G1' }, wiki: 'Digital signal processing' },
  { id: 'front-end', term: 'front end', short: 'A receiver\'s first stages, its filter and amplifier. A signal too strong for it overloads it.', taught: { level: 0, step: 'G1' }, wiki: 'RF front end' },
  { id: 'noise-floor', term: 'noise floor', aliases: ['noise'], short: 'The random hiss every receiver hears, made by heat: about −114 dBm in each MHz of band, 10 dB more for ten times the band.', taught: { level: 0, step: 'H1' }, wiki: 'Noise floor' },
  { id: 'snr', term: 'SNR', aliases: ['signal-to-noise ratio'], short: 'Signal-to-noise ratio: the signal\'s power over the noise power, in dB. Below 0 dB the signal is under the noise.', taught: { level: 0, step: 'H1' }, wiki: 'Signal-to-noise ratio' },
  { id: 'ber', term: 'BER', aliases: ['bit error rate'], short: 'Bit error rate: the fraction of bits that come out wrong. 0.01 is 1 bit in 100.', taught: { level: 0, step: 'I1' }, wiki: 'Bit error rate' },
  { id: 'ebn0', term: 'Eb/N0', short: 'The energy in one bit over the noise: the SNR counted per bit. The BER depends on it.', taught: { level: 0, step: 'I1' }, wiki: 'Eb/N0' },
  { id: 'jammer', term: 'jammer', aliases: ['jamming', 'noise jammer'], short: 'A transmitter that sends on purpose to drown out a link at its receiver.', taught: { level: 0, step: 'J1' }, wiki: 'Radio jamming' },
  { id: 'js', term: 'J/S', short: 'Jammer power over signal power, both where they arrive at the receiver, in dB.', taught: { level: 0, step: 'J1' }, wiki: 'Radio jamming' },
  { id: 'ebj0', term: 'Eb/J0', short: 'The energy in one bit over the jammer\'s noise. After despreading, Eb/J0 = Gp − J/S in dB.', taught: { level: 2, step: 'B1' }, wiki: 'Eb/N0' },
  { id: 'spread-spectrum', term: 'spread spectrum', short: 'Spreading a signal over a band far wider than its bits need, so it is hard to see and hard to jam.', taught: { level: 0, step: 'J3' }, wiki: 'Spread spectrum' },
  { id: 'dsss', term: 'direct sequence', aliases: ['dsss', 'direct-sequence'], short: 'Spread spectrum by multiplying every bit by a fast secret code of chips. This lab is direct sequence.', taught: { level: 0, step: 'J3' }, wiki: 'Direct-sequence spread spectrum' },
  { id: 'fhss', term: 'frequency hopping', short: 'Spread spectrum by jumping the carrier from channel to channel in a secret order.', taught: { level: 0, step: 'J3' }, wiki: 'Frequency-hopping spread spectrum' },
  { id: 'chip', term: 'chip', aliases: ['chips'], short: 'One short pulse of the code. Each bit is sent as many chips.', taught: { level: 1, step: 'A1' }, wiki: 'Chip (CDMA)' },
  { id: 'code', term: 'code', aliases: ['spreading code'], short: 'The fast secret pattern of chips that every bit is multiplied by. The receiver needs the same code.', taught: { level: 1, step: 'A1' }, wiki: 'Pseudorandom noise' },
  { id: 'chip-rate', term: 'chip rate', short: 'Chips sent each second, in Mcps. A chip lasts 1 ÷ chip rate. Read from the spectrum\'s nulls.', taught: { level: 1, step: 'C1' }, wiki: 'Chip (CDMA)' },
  { id: 'gp', term: 'processing gain', aliases: ['gp'], short: 'How much despreading lifts the signal over noise and jamming: chips per bit, or chip rate ÷ bit rate.', taught: { level: 1, step: 'A3' }, wiki: 'Process gain' },
  { id: 'despreading', term: 'despreading', short: 'Multiplying what is received by the code again and adding up each bit\'s chips. Only a receiver with the code can do it.', taught: { level: 1, step: 'A3' }, wiki: 'Direct-sequence spread spectrum' },
  { id: 'null', term: 'null', aliases: ['nulls'], short: 'A dip to zero in a spectrum. A chip spectrum\'s first nulls sit at ± the chip rate.', taught: { level: 1, step: 'C1' }, wiki: 'Sidelobes' },
  { id: 'autocorrelation', term: 'autocorrelation', short: 'How alike a signal is to itself delayed by a given time. A repeating code peaks again every code period.', taught: { level: 1, step: 'D1' }, wiki: 'Autocorrelation' },
  { id: 'preamble', term: 'preamble', short: 'The code sent over and over at the start of a transmission, with no data on it, so a receiver can lock on.', taught: { level: 1, step: 'D1' }, wiki: 'Syncword' },
  { id: 'short-code', term: 'short code', short: 'A code that repeats every bit. Easy to measure; most links in this lab use one.', taught: { level: 1, step: 'A3' }, wiki: 'Maximum-length sequence' },
  { id: 'long-code', term: 'long code', short: 'A code much longer than a bit, so every bit gets a different stretch of it, with no repeat to find.', taught: { level: 1, step: 'A3' }, wiki: 'Pseudorandom noise' },
  { id: 'partial-band', term: 'partial-band jamming', aliases: ['partial-band noise', 'partial-band'], short: 'Noise squeezed into part of the band, stronger there. Despreading spreads it back out.', taught: { level: 3, step: 'A1' }, wiki: 'Radio jamming' },
  { id: 'pulsed', term: 'pulsed jamming', aliases: ['pulsed noise', 'pulses'], short: 'The jammer\'s power squeezed into bursts, stronger while on. It hurts when each pulse covers whole bits.', taught: { level: 3, step: 'A1' }, wiki: 'Duty cycle' },
  { id: 'duty', term: 'duty cycle', aliases: ['duty'], short: 'The fraction of the time a pulsed jammer is on. Same average power: 1 ÷ duty times stronger while on.', taught: { level: 3, step: 'C1' }, wiki: 'Duty cycle' },
  { id: 'tone', term: 'tone jammer', aliases: ['tone'], short: 'A jammer sending one steady frequency: all its power in one spike.', taught: { level: 4, step: 'A1' }, wiki: 'Continuous wave' },
  { id: 'papr', term: 'PAPR', aliases: ['peak-to-average ratio'], short: 'Peak-to-average power ratio. n tones in phase peak at n times the average: 10 × log10(n) dB.', taught: { level: 4, step: 'D1' }, wiki: 'Crest factor' },
  { id: 'vote', term: 'majority vote', aliases: ['vote', 'repetition'], short: 'Sending every bit three times and keeping the value at least two copies agree on. A copy error rate p becomes about 3p².', taught: { level: 5, step: 'A1' }, wiki: 'Repetition code' },
  { id: 'df', term: 'direction finding', aliases: ['direction-finding'], short: 'Measuring the direction a radio signal comes from, at a site that only listens. DF for short.', taught: { level: 6, step: 'A1' }, wiki: 'Direction finding' },
  { id: 'bearing', term: 'bearing', aliases: ['bearings'], short: 'The direction a signal comes from, in degrees clockwise from north: east is 90°, south 180°.', taught: { level: 6, step: 'A1' }, wiki: 'Bearing (angle)' },
  { id: 'interferometer', term: 'interferometer', short: 'Two antennas a short way apart. The phase difference between them, Δφ = 2π × d × sin θ ÷ λ, gives the bearing.', taught: { level: 6, step: 'C1' }, wiki: 'Direction finding' },
  { id: 'triangulation', term: 'triangulation', short: 'Finding a transmitter where bearings from two or more sites cross. The law of sines gives each range.', taught: { level: 6, step: 'D1' }, wiki: 'Triangulation' },
  { id: 'gdop', term: 'GDOP', aliases: ['geometric dilution of precision'], short: 'How the geometry multiplies the measurement errors. Lines crossing near 90° keep it small; narrow crossings stretch the error.', taught: { level: 6, step: 'D1' }, wiki: 'Dilution of precision (navigation)' },
  { id: 'fix', term: 'fix', aliases: ['least-squares fix'], short: 'The position that fits all the bearings (or time differences) best, each weighted by how sharp it is.', taught: { level: 6, step: 'E1' }, wiki: 'Position fix' },
  { id: 'error-ellipse', term: 'error ellipse', aliases: ['ellipse'], short: 'The area round a fix where the transmitter probably is: long where the lines run nearly together, short where they cross.', taught: { level: 6, step: 'E1' }, wiki: 'Confidence region' },
  { id: 'cep', term: 'CEP', aliases: ['circular error probable'], short: 'Circular error probable: the radius of the circle round the fix that holds the transmitter half the time. About 0.75 × √(a² + b²).', taught: { level: 6, step: 'E1' }, wiki: 'Circular error probable' },
  { id: 'tdoa', term: 'TDOA', aliases: ['time difference of arrival'], short: 'Time difference of arrival: locating a transmitter from when its signal reaches each of several plain receivers.', taught: { level: 6, step: 'G1' }, wiki: 'Multilateration' },
  { id: 'hyperbola', term: 'hyperbola', aliases: ['hyperbolas'], short: 'The curve of points with the same range difference to two sites. One time difference puts the transmitter on one.', taught: { level: 6, step: 'G1' }, wiki: 'Hyperbola' },
  { id: 'fdoa', term: 'FDOA', aliases: ['frequency difference of arrival'], short: 'Frequency difference of arrival: the Doppler shift two moving sensors see differs, which adds a second curve to TDOA.', taught: { level: 6, step: 'G1' }, wiki: 'Frequency difference of arrival' },
  { id: 'cross-correlation', term: 'cross-correlation', short: 'How alike two recordings are at each delay. It peaks at the delay between them: the time difference.', taught: { level: 6, step: 'G2' }, wiki: 'Cross-correlation' },
];

const BY_NAME = new Map<string, GlossaryEntry>();
for (const e of GLOSSARY) {
  for (const n of [e.id, e.term.toLowerCase(), ...(e.aliases ?? [])]) BY_NAME.set(n, e);
}

export function glossaryEntry(name: string): GlossaryEntry | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

export const wikiUrl = (title: string): string => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

// [[term]] or [[shown text|term]].
export const GLOSS_MARK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export type RichPart = string | { shown: string; entry: GlossaryEntry };

// Splits a lesson text into plain strings and glossary terms. An unknown term is left as its shown text.
export function richParts(text: string): RichPart[] {
  const out: RichPart[] = [];
  let last = 0;
  for (const m of text.matchAll(GLOSS_MARK)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const entry = glossaryEntry(m[2] ?? m[1]);
    out.push(entry ? { shown: m[1], entry } : m[1]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The text as a reader sees it, without the markup.
export const plainText = (text: string): string => text.replace(GLOSS_MARK, (_m, shown: string) => shown);

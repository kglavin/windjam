// Level 0: Radio basics. Lessons only, each with a video and one unscored check (docs/design-level-0.md).
import { EXAMPLE, type LevelDef, PRACTICE } from './types';

const none = { kind: 'none' } as const;

export const LEVEL_0: LevelDef = {
  id: 0,
  title: 'Radio basics',
  intro:
    'The words and ideas the later levels use: frequency and microseconds, bits on a wave, the spectrum and mixing, decibels, distance and antennas, what is inside a radio, noise, bit errors and jamming, then networks and what spread spectrum protects. Each lesson is a short video and a few lines of text. Skip it if you know this already.',
  passMark: 0,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'The radio link',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Transmitter, path, receiver',
          visual: none,
          video: 'level0-A1',
          paragraphs: [
            'Every radio link has three parts. The [[transmitter|transmitter]] turns a message into a radio wave. The wave travels along a path through the air. The [[receiver|receiver]] catches a little of the wave and turns it back into the message.',
            'The [[antenna|antenna]] is the bridge between wires and air. At the transmitter it turns an electric current into a radio wave. At the receiver it turns the wave back into a small current.',
            'In this lab you will see four stations: an enemy transmitter, its receiver, a [[jammer|jammer]] that tries to drown the link out, and your own [[intercept receiver|intercept]], which listens in.',
          ],
          check: {
            question: 'How many basic parts does every radio link have?',
            answer: 3,
            tol: { exact: true },
            wrong: 'Transmitter, path, receiver.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'Waves',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'Frequency, period and wavelength',
          visual: none,
          video: 'level0-B1',
          paragraphs: [
            'A radio wave wiggles up and down. How many full wiggles (cycles) it makes each second is its frequency, in hertz (Hz). 1 kHz is a thousand cycles a second, 1 MHz a million, 1 GHz a billion.',
            'The period is how long one cycle lasts: period = 1 ÷ frequency. At 1 MHz one cycle lasts 1 microsecond (µs), a millionth of a second. At 2 MHz it lasts 0.5 µs. Every later level uses this: 1 ÷ MHz gives µs.',
            'Radio waves travel at the speed of light, 300,000 km every second. The [[wavelength|wavelength]] is how far the wave gets in one period: wavelength = speed ÷ frequency. At 300 MHz it is 1 metre, at 3 GHz 10 cm. Higher frequency, shorter wave.',
          ],
          check: {
            question: 'A wave at 2 MHz. How long is one cycle, in µs?',
            unit: 'µs',
            answer: 0.5,
            tol: { rel: 0.01 },
            wrong: 'Period = 1 ÷ frequency = 1 ÷ 2 MHz.',
          },
        },
      ],
    },
    {
      id: 'C',
      title: 'Putting bits on a wave',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Carrier and keying',
          visual: none,
          video: 'level0-C1',
          paragraphs: [
            'A [[transmitter|transmitter]] starts from a steady wave at one frequency, the [[carrier|carrier]]. To send a message it changes the carrier. For bits, ones and zeros, there are three simple ways.',
            'ASK changes the wave\'s height: on for a 1, off for a 0. FSK changes its frequency: one note for a 1, another for a 0. PSK changes its phase, where the wave is in its cycle: for one bit value the wave runs as it is, for the other it is turned upside down.',
            'The links in this lab use PSK with two phases, called [[BPSK|bpsk]]. A bit is written +1 (the wave as it is) or −1 (the wave upside down, shifted 180°). The phase is the bit itself. That is why the later levels draw bits as +1 and −1.',
          ],
          check: {
            question: 'In BPSK, a −1 bit is the wave turned upside down. How many degrees of phase is that?',
            unit: '°',
            answer: 180,
            tol: { exact: true },
            wrong: 'Upside down is half a cycle: 180°.',
          },
        },
      ],
    },
    {
      id: 'D',
      title: 'The spectrum',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Power at each frequency',
          visual: none,
          video: 'level0-D1',
          paragraphs: [
            'A [[spectrum|spectrum]] plot shows how much power a signal has at each frequency. Frequency runs across, power up.',
            'A steady tone sits at one frequency: one thin spike. A signal that changes, such as a stream of bits, spreads over a band of frequencies: a hump. The faster it changes, the wider the hump. Pulses 1 µs long make a hump reaching 1 MHz each side of the centre.',
            'The later levels read spectra all the time: where a signal sits, how wide it is, and whether it stands above the noise. Their frequencies are measured from the [[carrier|carrier]], so 0 MHz is the carrier itself; the next lesson shows how a [[receiver|receiver]] gets there.',
          ],
          check: {
            question: 'Pulses 1 µs long make a hump reaching 1 MHz each side. Pulses 0.5 µs long: how far does the hump reach, in MHz?',
            unit: 'MHz',
            answer: 2,
            tol: { rel: 0.01 },
            wrong: 'Twice as fast, twice as wide: 1 ÷ 0.5 µs = 2 MHz.',
          },
        },
        {
          kind: 'lesson',
          id: 'D2',
          title: 'From the air to 0 MHz',
          visual: none,
          video: 'level0-D2',
          paragraphs: [
            'The enemy link may arrive at, say, 140 MHz, with a hump 2 MHz wide. Receivers shift it down to a lower frequency before working on it.',
            'A [[mixer|mixer]] multiplies the signal by a steady wave from a [[local oscillator|lo]] (LO). The product holds the difference and the sum of the two frequencies: 140 MHz with a 138 MHz LO gives 2 MHz and 278 MHz. A filter keeps the 2 MHz copy, the [[intermediate frequency|if]] (IF). The signal\'s shape does not change, only where it sits.',
            'Some receivers stop at a low IF like that, which keeps the signal away from 0 Hz where hardware adds its own offsets. Others use two mixers 90° apart, called [[I and Q|iq]], and shift all the way down so the [[carrier|carrier]] lands on 0 MHz: −1 MHz is then 1 MHz below the carrier, +1 MHz above it. The lab\'s spectra are drawn that way. After that an [[ADC|adc]] turns the signal into numbers and software ([[DSP|dsp]]) does the rest.',
          ],
          check: {
            question: 'A signal at 140 MHz is mixed with a 138 MHz local oscillator. What frequency does the filter keep, the difference, in MHz?',
            unit: 'MHz',
            answer: 2,
            tol: { exact: true },
            wrong: '140 − 138.',
          },
        },
      ],
    },
    {
      id: 'E',
      title: 'Decibels',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Decibels without fear',
          visual: none,
          video: 'level0-E1',
          paragraphs: [
            'Radio powers range from kilowatts at a [[transmitter|transmitter]] to less than a picowatt at a [[receiver|receiver]]. Decibels (dB) turn the multiplying into adding: dB = 10 × log10(power ratio).',
            'Remember four: +3 dB doubles the power, −3 dB halves it, +10 dB is 10 times, −10 dB is a tenth. Build the rest from them: +13 dB = +10 + 3, so 10 × 2 = 20 times. −7 dB = −10 + 3, so 0.1 × 2 = 0.2 times.',
            'dBm is an amount of power, compared with 1 milliwatt: 0 dBm = 1 mW, +30 dBm = 1 W, −30 dBm = 1 µW. dB is a ratio between two powers; dBm is a power.',
          ],
          check: {
            question: '+20 dB is how many times the power?',
            unit: 'times',
            answer: 100,
            tol: { exact: true },
            wrong: '+20 dB = +10 + 10, so 10 × 10.',
          },
        },
      ],
    },
    {
      id: 'F',
      title: 'Distance and antennas',
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: 'Spreading loss',
          visual: none,
          video: 'level0-F1',
          paragraphs: [
            'A radio wave spreads out as it travels, like the skin of a growing balloon: the same power covers a bigger area. Twice as far, the area is 4 times bigger, so a [[receiver|receiver]] gets a quarter of the power: 6 dB less.',
            'Near the ground there is a second path: the wave reflected off the ground, which partly cancels the direct one. Then the power falls faster, 12 dB for every doubling of distance.',
            'That is why distance matters so much in the lab. Move your [[intercept receiver|intercept]] closer and the enemy signal gets stronger. Move a [[jammer|jammer]] closer to the enemy receiver and its jamming gets stronger.',
          ],
          check: {
            question: 'In open space, how many dB weaker is a signal at 4 times the distance?',
            unit: 'dB',
            answer: 12,
            tol: { exact: true },
            wrong: '4 times is two doublings: 6 + 6 dB.',
          },
        },
        {
          kind: 'lesson',
          id: 'F2',
          title: 'Antennas',
          visual: none,
          video: 'level0-F2',
          paragraphs: [
            'An [[antenna|antenna]]\'s pattern shows how strongly it sends in each direction, and it hears with the same pattern. Gains are given in dBi: compared with an imaginary antenna that sends equally in every direction.',
            'A simple [[dipole|dipole]] sends nothing along its own rod and most sideways, the same all round: seen from above, no direction is favoured. The power kept from up and down goes sideways, about 2 dBi.',
            'A [[directional antenna|directional]], a Yagi or a dish, focuses its power into a beam: 10 dBi for a small Yagi, 30 dBi or more for a dish, and much less to the side. A [[transmitter|transmitter]] beamed at its [[receiver|receiver]] is hard to hear from the side, so an [[intercept|intercept]] has to get into the beam or much closer. A receiver beamed at its transmitter hears a [[jammer|jammer]] off to the side through the weak edge of its pattern, and that difference comes straight off the jammer\'s [[J/S|js]].',
          ],
          check: {
            question: 'A receiving antenna has +10 dBi toward its transmitter and −10 dBi toward a jammer. By how many dB does that lower J/S?',
            unit: 'dB',
            answer: 20,
            tol: { exact: true },
            wrong: '+10 − (−10) = 20 dB in favour of the link.',
          },
        },
      ],
    },
    {
      id: 'G',
      title: 'Inside a radio',
      steps: [
        {
          kind: 'lesson',
          id: 'G1',
          title: 'Transmitter and receiver, block by block',
          visual: none,
          video: 'level0-G1',
          paragraphs: [
            'A [[transmitter|transmitter]]: software ([[DSP|dsp]]) codes the bits and makes the [[BPSK|bpsk]] signal as numbers; a DAC turns them into a voltage; a [[mixer|mixer]] moves it up to the radio frequency; a filter keeps only the wanted band; a power amplifier makes it strong; the [[antenna|antenna]] sends it.',
            'A [[receiver|receiver]] works the other way round. A front-end filter keeps the band and blocks strong signals outside it. A [[low-noise amplifier|lna]] (LNA) lifts the weak signal while adding as little noise as it can. A mixer moves it down, a filter and more amplifiers ready it, an [[ADC|adc]] turns it into numbers, and DSP despreads and decides each bit.',
            'Follow the power: +40 dBm (10 W) out of the power amplifier, about −70 dBm at the receiving antenna after the path, then back up through the amplifiers to a level the ADC can measure. A signal too strong for the [[front end|front-end]] overloads it, which level 5 uses.',
          ],
          check: {
            question: 'The power amplifier puts out +40 dBm and the path loses 110 dB. What reaches the receiving antenna, in dBm?',
            unit: 'dBm',
            answer: -70,
            tol: { exact: true },
            wrong: '+40 − 110.',
          },
        },
      ],
    },
    {
      id: 'H',
      title: 'Noise',
      steps: [
        {
          kind: 'lesson',
          id: 'H1',
          title: 'Noise and SNR',
          visual: none,
          video: 'level0-H1',
          paragraphs: [
            'Every [[receiver|receiver]] hears noise: a random hiss made by heat in its own parts and in the air around it. It sets a floor below which signals are hard to see.',
            'The wider the band a receiver listens to, the more noise it hears: 10 times wider, 10 times the noise (+10 dB). At room temperature the floor is about −114 dBm in a 1 MHz band.',
            '[[SNR|snr]], the signal-to-noise ratio, compares the signal\'s power with the noise, in dB. +10 dB: the signal is 10 times stronger. 0 dB: equal. −10 dB: 10 times weaker, buried in the noise. A spread-[[spectrum|spectrum]] signal is built to sit below the noise; the later levels show how its receiver still gets it back.',
          ],
          check: {
            question: 'The noise in a 1 MHz band is −114 dBm. What is it in a 10 MHz band, in dBm?',
            unit: 'dBm',
            answer: -104,
            tol: { exact: true },
            wrong: '10 times wider is +10 dB: −114 + 10.',
          },
        },
      ],
    },
    {
      id: 'I',
      title: 'Bit errors',
      steps: [
        {
          kind: 'lesson',
          id: 'I1',
          title: 'Bit errors and the cliff',
          visual: none,
          video: 'level0-I1',
          paragraphs: [
            'A digital [[receiver|receiver]] decides, bit by bit, whether it got a +1 or a −1. Noise pushes some of them over to the wrong side. The [[bit error rate|ber]], BER, is the fraction it gets wrong: 0.01 is 1 bit in 100.',
            'For digital links the measure that matters is [[Eb/N0|ebn0]]: the energy in one bit over the noise. It is the [[SNR|snr]] counted per bit. Level 1 shows how to get it from the SNR.',
            'BER falls fast as Eb/N0 rises: every couple of dB cuts the errors by a large factor. So a digital link is either fine or broken, with a short step between them: the cliff. A [[jammer|jammer]] only has to push the link over the edge.',
          ],
          check: {
            question: 'A BER of 0.001: how many wrong bits in every 1000?',
            unit: 'bits',
            answer: 1,
            tol: { exact: true },
            wrong: '0.001 × 1000 = 1.',
          },
        },
      ],
    },
    {
      id: 'J',
      title: 'Jamming',
      steps: [
        {
          kind: 'lesson',
          id: 'J1',
          title: 'Jammer to signal ratio',
          visual: none,
          video: 'level0-J1',
          paragraphs: [
            'A [[jammer|jammer]] transmits on purpose to drown out a link. What counts is what arrives at the enemy [[receiver|receiver]]: the jammer\'s power J against the signal\'s power S. Their ratio, [[J/S|js]], is given in dB.',
            'In dB it is bookkeeping: start from each [[transmitter|transmitter]]\'s power, add [[antenna|antenna]] gains, subtract path losses, and compare what arrives. J/S = J − S. A jammer close to the receiver can beat a much stronger transmitter far away.',
            'Against an ordinary digital link a jammer needs about J/S = 0 dB, as strong as the signal. [[Spread spectrum|spread-spectrum]] changes that, and level 2 measures by how much.',
          ],
          check: {
            question: 'The jammer arrives at −60 dBm and the signal at −70 dBm. What is J/S, in dB?',
            unit: 'dB',
            answer: 10,
            tol: { exact: true },
            wrong: 'J/S = J − S = −60 − (−70).',
          },
        },
        {
          kind: 'lesson',
          id: 'J2',
          title: 'Jamming an ordinary link',
          visual: none,
          video: 'level0-J2',
          paragraphs: [
            'Take an ordinary [[BPSK|bpsk]] link, with no spreading: each bit sent on its own. A [[noise jammer|jammer]] puts its noise on the same frequencies, and some bits are pushed over to the wrong side.',
            'Here the energy per bit over the jamming, [[Eb/J0|ebj0]], is simply S/J. At [[J/S|js]] = 0 dB, the jammer as strong as the signal, about 8 bits in 100 come out wrong: the link is broken. At +10 dB a third are wrong.',
            'Spread the same link with a [[processing gain|gp]] of 20 dB and the jammer at +10 dB leaves Eb/J0 = 20 − 10 = 10 dB: a few errors in a million. That is what spreading buys, and level 2 measures it.',
          ],
          check: {
            question: 'A plain BPSK link (no spreading) is jammed at J/S = 0 dB. What is Eb/J0, in dB?',
            unit: 'dB',
            answer: 0,
            tol: { exact: true },
            wrong: 'With no spreading, Eb/J0 = S/J, which is 0 dB when J/S is 0 dB.',
          },
        },
        {
          kind: 'lesson',
          id: 'J3',
          title: 'Spread spectrum, a preview',
          visual: none,
          video: 'level0-J3',
          paragraphs: [
            '[[Spread spectrum|spread-spectrum]] spreads a signal over a band far wider than its bits need. [[Frequency hopping|fhss]] jumps the [[carrier|carrier]] from channel to channel in a secret order. [[Direct sequence|dsss]] multiplies every bit by a fast secret [[code|code]] of [[chips|chip]]. This lab is direct sequence.',
            'The [[receiver|receiver]] that knows the code gathers the spread signal back together. Anything that does not follow the code, a [[jammer|jammer]] included, stays spread out. The advantage is the [[processing gain|gp]]: [[chip rate|chip-rate]] ÷ bit rate. A jammer needs about that much more power.',
            'Level 1 starts here: you find an enemy direct-sequence link and measure its chip rate, its code and its processing gain.',
          ],
          check: {
            question: 'Chips at 1 Mcps (a million a second) and bits at 10 kbps (ten thousand a second). Processing gain, in times?',
            unit: 'times',
            answer: 100,
            tol: { exact: true },
            wrong: '1,000,000 ÷ 10,000.',
          },
        },
      ],
    },
    {
      id: 'K',
      title: 'The bigger picture',
      steps: [
        {
          kind: 'lesson',
          id: 'K1',
          title: 'Networks',
          visual: none,
          video: 'level0-K1',
          paragraphs: [
            'Radios work in networks, and the layout decides what jamming or finding one radio does.',
            'One-to-one: two radios talk only to each other. Jam the receiver you want to deny, and only that direction of the link is lost.',
            'Hub and spoke: one [[hub|hub]] talks to many outstations. Every message to the hub arrives at one receiver, so jamming near the hub cuts every spoke at once. The hub also sends the most, so it is the easiest radio to find (level 6). It is usually the headquarters.',
            'A shared net: everyone on one channel, one speaker at a time. Every member has its own receiver, so jamming one member cuts off that member. To break the net, the jammer has to cover the channel near all the members.',
            '[[Mesh|mesh]]: each radio relays for its neighbours. Jam one and the traffic finds another path. The jammer has to cover many radios, or the few links that join one group to another.',
          ],
          check: {
            question: 'A hub serves 8 outstations. A jammer near the hub drowns its receiver. How many outstations can no longer reach it?',
            answer: 8,
            tol: { exact: true },
            wrong: 'All their messages arrive at the one receiver the jammer drowns.',
          },
        },
        {
          kind: 'lesson',
          id: 'K2',
          title: 'What spread spectrum protects',
          visual: none,
          video: 'level0-K2',
          paragraphs: [
            'An attacker works in steps: detect that a signal is there, intercept it and measure it, locate the transmitter, read the message, and jam the link. Each step has its defence.',
            '[[LPD|lpd]], low probability of detection: the signal sits so low, spread over a wide band, that it is hard to notice at all. Hard is not impossible: listening longer or getting closer still finds it (level 1, B1).',
            '[[LPI|lpi]], low probability of intercept: even once noticed, the signal is hard to measure and to locate. Long codes and hopping keep its pattern hidden.',
            '[[LPE|lpe]], low probability of exploitation: even once captured, the message cannot be read. That takes encryption. A spreading code is not a cipher: level 8 shows a simple code can be rebuilt from what it sends.',
            '[[AJ|aj]], anti-jam: the [[processing gain|gp]] makes a jammer need that much more power. Levels 2 to 5 attack it, and level 6 finds the transmitter.',
          ],
          check: {
            question: 'A signal 10 kHz wide is spread to 10 MHz with the same power. How many times lower is its power in each kHz?',
            unit: 'times',
            answer: 1000,
            tol: { exact: true },
            wrong: '10 MHz is 10,000 kHz, 1000 times as wide as 10 kHz. The same power is spread 1000 times thinner.',
          },
        },
      ],
    },
  ],
  debrief:
    'You have the words the lab uses: frequency and period, bits as +1 and −1, the spectrum and mixing, decibels, distance and antennas, the blocks inside a radio, noise and SNR, bit errors, J/S, why spreading resists jamming, and how networks and the steps of an attack shape the fight. Level 1 puts them to work on an enemy spread-spectrum link.',
};

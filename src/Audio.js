//WebAudio-based procedural sound effects

import { rollDice } from "./UntrustedUtils.js";

let AC = null;
let musicGain = null;
let musicSource = null;
let musicBuffer = null;
let currentMusicUrl = null;

//Create AudioContext on user gesture (browser autoplay requirement)
export function resumeAudio() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
  }
}

//Play oscillator-based tone with envelope and optional pitch slide
function beep({
  freq = 440,
  dur = 0.1,
  type = "square",
  vol = 0.2,
  slide = 0,
}) {
  if (!AC) {
    return;
  }

  const o = AC.createOscillator();
  const g = AC.createGain();

  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;

  o.connect(g).connect(AC.destination);

  const now = AC.currentTime;

  if (slide) {
    o.frequency.setValueAtTime(freq, now);
    o.frequency.linearRampToValueAtTime(freq + slide, now + dur);
  }

  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);

  o.start(now);
  o.stop(now + dur);
}

//Play filtered white noise burst
function noise({ dur = 0.2, vol = 0.2, lp = 1200 }) {
  if (!AC) {
    return;
  }
  const buffer = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = AC.createBufferSource();
  const g = AC.createGain();
  const f = AC.createBiquadFilter();

  src.buffer = buffer;
  g.gain.value = vol;
  f.type = "lowpass";
  f.frequency.value = lp;

  src.connect(f).connect(g).connect(AC.destination);

  const now = AC.currentTime;
  src.start(now);
  src.stop(now + dur);
}

//Game sound effects
export const SFX = {
  shot: () => {
    const randomVariation = rollDice(50);
    const negativeRandomVariation = -rollDice(50);
    beep({
      freq: 220 + randomVariation + negativeRandomVariation,
      dur: 0.05 + rollDice(3) / 100,
      type: "square",
      vol: 0.25,
      slide: 120,
    });
    noise({ dur: 0.03 + rollDice(3) / 100, vol: 0.15, lp: 800 });
  },

  pickup: () => {
    beep({ freq: 880, dur: 0.06, type: "triangle", vol: 0.2 });
    beep({ freq: 1180, dur: 0.08, type: "triangle", vol: 0.18 });
  },

  explode: () => {
    noise({ dur: 1, vol: 0.3, lp: 800 });
    beep({ freq: 90, dur: 0.7, type: "sawtooth", vol: 0.12, slide: -60 });
  },

  hurt: () => {
    beep({ freq: 140, dur: 0.12, type: "sawtooth", vol: 0.2, slide: -50 });
  },

  killedEntity: () => {
    const detune = Math.random() * 16 - 8; //small variation

    //Rubbery body (downward glide)
    beep({
      freq: 320 + detune,
      dur: 0.26,
      type: "triangle",
      vol: 0.3,
      slide: -220,
    });

    //Bright overtone layer
    beep({
      freq: 480 + detune,
      dur: 0.22,
      type: "sawtooth",
      vol: 0.1,
      slide: -260,
    });

    //Soft thud
    beep({ freq: 90, dur: 0.08, type: "sine", vol: 0.18 });

    //Wet slap
    noise({ dur: 0.05, vol: 0.1, lp: 1000 });

    //Little rebound chirp (starts slightly later)
    setTimeout(() => {
      beep({
        freq: 170 + detune,
        dur: 0.07,
        type: "triangle",
        vol: 0.16,
        slide: 70,
      });
    }, 90);
  },

  door: () => {
    beep({ freq: 420, dur: 0.12, type: "square", vol: 0.15 });
  },

  portal: () => {
    beep({ freq: 600, dur: 0.5, type: "sawtooth", vol: 0.2 });
    beep({ freq: 400, dur: 0.3, type: "sawtooth", vol: 0.2, slide: 50 });
    beep({ freq: 600, dur: 0.5, type: "sawtooth", vol: 0.2 });
  },
};

//Background music helpers
export async function playMusicLoop(url, { volume = 0.15 } = {}) {
  //Only attempt if AudioContext exists (after user gesture)
  if (!AC) {
    return;
  }
  try {
    //Cache and reuse decoded buffer for the same URL
    if (!musicBuffer || url !== currentMusicUrl) {
      const res = await fetch(url, { cache: "force-cache" });
      const arr = await res.arrayBuffer();
      musicBuffer = await AC.decodeAudioData(arr);
      currentMusicUrl = url;
    }
    //Stop previous
    stopMusic();
    //Create source + gain
    musicSource = AC.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.loop = true;
    musicGain = AC.createGain();
    musicGain.gain.value = volume;
    musicSource.connect(musicGain).connect(AC.destination);
    musicSource.start();
  } catch (e) {
    void e; //suppress unused var lint
    //Fallback: try HTMLAudio if WebAudio path fails
    try {
      stopMusic();
      const tag = new Audio(url);
      tag.loop = true;
      tag.volume = Math.max(0, Math.min(1, volume));
      await tag.play();
      //Bridge into our handles so stopMusic() will pause it
      musicSource = {
        stop: () => tag.pause(),
        disconnect: () => {},
      };
      musicGain = null;
    } catch (e2) {
      void e2; //ignore
    }
  }
}

export function stopMusic() {
  try {
    if (musicSource) {
      musicSource.stop(0);
    }
  } catch (e) {
    void e; //ignore
  }
  if (musicSource && musicSource.disconnect) {
    try {
      musicSource.disconnect();
    } catch (e2) {
      void e2;
    }
  }
  if (musicGain) {
    try {
      musicGain.disconnect();
    } catch (e3) {
      void e3;
    }
  }
  musicSource = null;
  musicGain = null;
}

//Convenience: start shooter BGM if not already playing
let shooterMusicArmed = false;
export async function ensureShooterMusic() {
  //Arm once per page lifetime to avoid repeated fetch/decodes
  if (!AC) {
    return;
  }
  if (musicSource) {
    return; //already playing something
  }
  if (shooterMusicArmed) {
    return;
  }
  shooterMusicArmed = true;
  //Use path relative to the hosting page root
  const url = "../assets/sfx/HexenST02SLowed.ogg"; //Ensure this matches the actual filename
  await playMusicLoop(url, { volume: 0.12 });
}

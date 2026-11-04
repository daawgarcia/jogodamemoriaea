let context: AudioContext | undefined;
let master: GainNode | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let step = 0;
const melody = [64, 67, 71, 74, 71, 67, 69, 72, 76, 72, 69, 67, 64, 67, 69, 62];

export async function playMusic(volume: number) {
  context ??= new AudioContext();
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') throw new Error('O áudio não foi liberado. Toque novamente em Som.');
  master ??= context.createGain();
  master.gain.value = volume * 0.3;
  master.connect(context.destination);
  if (timer) return;
  const tick = () => {
    if (!context || !master) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * 2 ** ((melody[step++ % melody.length] - 69) / 12);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.65, now + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
    if (step % 4 === 1) {
      const bass = context.createOscillator();
      const gain = context.createGain();
      bass.frequency.setValueAtTime(110, now);
      bass.frequency.exponentialRampToValueAtTime(45, now + 0.16);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      bass.connect(gain); gain.connect(master);
      bass.start(now); bass.stop(now + 0.2);
    }
  };
  tick();
  timer = setInterval(tick, 260);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (master) master.gain.value = 0;
}

export function setMusicVolume(value: number) {
  if (master) master.gain.value = value * 0.3;
}

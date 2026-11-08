import ggwaveFactory from "ggwave";

let ctx: AudioContext | undefined;
let g: any;
let instance: number;

// Use the same protocol you validated in the prototype tests.
const protocol = () => g.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_FAST;

const convert = (src: any, Type: any) => {
  const buf = new ArrayBuffer(src.byteLength);
  new src.constructor(buf).set(src);
  return new Type(buf);
};

async function init() {
  if (ctx) return;
  ctx = new AudioContext();
  g = await ggwaveFactory();
  const p = g.getDefaultParameters();
  p.sampleRateInp = ctx.sampleRate;
  p.sampleRateOut = ctx.sampleRate;
  instance = g.init(p);
}

export async function chime() {
  await init();
  const c = ctx!;
  await c.resume();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.2, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.6);
  await new Promise((r) => setTimeout(r, 800));
}

export async function playToken(token: string, volume = 10) {
  await init();
  const c = ctx!;
  await c.resume();
  const wave = g.encode(instance, token, protocol(), volume);
  const samples = convert(wave, Float32Array) as Float32Array;
  const buffer = c.createBuffer(1, samples.length, c.sampleRate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  await new Promise<void>((resolve) => {
    src.onended = () => resolve();
    src.start();
  });
}

export async function listen(onText: (text: string) => void): Promise<() => void> {
  await init();
  const c = ctx!;
  await c.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = c.createMediaStreamSource(stream);
  const proc = c.createScriptProcessor(1024, 1, 1);
  proc.onaudioprocess = (e) => {
    const input = new Float32Array(e.inputBuffer.getChannelData(0));
    const res = g.decode(instance, convert(input, Int8Array));
    if (res && res.length > 0) onText(new TextDecoder("utf-8").decode(res));
  };
  source.connect(proc);
  proc.connect(c.destination);
  return () => {
    proc.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
  };
}

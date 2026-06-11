interface Segment {
  duration: number; // seconds
  bpm: number;
}

const rowsEl = document.getElementById("rows") as HTMLDivElement;
const addBtn = document.getElementById("add") as HTMLButtonElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;

function addRow(duration = "1", bpm = 120): void {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <label>Duration (min, or "23s")
      <input type="text" class="duration" value="${duration}">
    </label>
    <label>BPM
      <input type="number" class="bpm" min="20" max="400" step="1" value="${bpm}">
    </label>
    <button type="button" class="remove" title="Remove segment">−</button>
  `;
  (row.querySelector(".remove") as HTMLButtonElement).onclick = () => {
    if (rowsEl.children.length > 1) row.remove();
  };
  rowsEl.appendChild(row);
}

// Minutes by default; an "s" suffix (e.g. "23s") means seconds,
// an optional "m"/"min" suffix is also accepted.
function parseDuration(text: string): number {
  const match = /^(\d+(?:[.,]\d+)?)\s*(s|m|min)?$/.exec(text.trim().toLowerCase());
  if (!match) return NaN;
  const value = Number(match[1].replace(",", "."));
  return match[2] === "s" ? value : value * 60;
}

function readSegments(): Segment[] {
  const segments: Segment[] = [];
  for (const row of Array.from(rowsEl.children)) {
    const duration = parseDuration((row.querySelector(".duration") as HTMLInputElement).value);
    const bpm = Number((row.querySelector(".bpm") as HTMLInputElement).value);
    if (duration > 0 && bpm > 0) segments.push({ duration, bpm });
  }
  return segments;
}

// --- Playback: lookahead scheduling on the Web Audio clock ---

const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

let audioCtx: AudioContext | null = null;
let timer: number | undefined;

function click(ctx: AudioContext, time: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1320 : 880;
  gain.gain.setValueAtTime(1, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.05);
}

function start(segments: Segment[]): void {
  const ctx = new AudioContext();
  audioCtx = ctx;

  // Precompute each segment's start time relative to t0.
  const starts: number[] = [0];
  for (const seg of segments) starts.push(starts[starts.length - 1] + seg.duration);
  const totalEnd = starts[segments.length];

  const t0 = ctx.currentTime + 0.1;
  let segIndex = 0;
  let beatInSeg = 0;
  let highlighted = -1;

  timer = window.setInterval(() => {
    const now = ctx.currentTime;

    // Schedule all beats that fall inside the lookahead window. The first
    // beat of each segment lands exactly when the previous duration ends.
    while (segIndex < segments.length) {
      const seg = segments[segIndex];
      const beatTime = t0 + starts[segIndex] + beatInSeg * (60 / seg.bpm);
      if (beatTime > now + LOOKAHEAD_S) break;
      if (beatTime < t0 + starts[segIndex + 1]) {
        click(ctx, beatTime, beatInSeg === 0);
        beatInSeg++;
      } else {
        segIndex++;
        beatInSeg = 0;
      }
    }

    // Highlight the segment that is audible right now.
    const elapsed = now - t0;
    const current = starts.findIndex((s, i) => elapsed >= s && elapsed < starts[i + 1]);
    if (current !== highlighted) {
      highlighted = current;
      Array.from(rowsEl.children).forEach((row, i) =>
        row.classList.toggle("active", i === current)
      );
    }

    if (elapsed >= totalEnd) stop();
  }, TICK_MS);

  playBtn.textContent = "■ Stop";
}

function stop(): void {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  Array.from(rowsEl.children).forEach((row) => row.classList.remove("active"));
  playBtn.textContent = "▶ Play";
}

playBtn.onclick = () => {
  if (audioCtx) {
    stop();
    return;
  }
  const segments = readSegments();
  if (segments.length > 0) start(segments);
};

addBtn.onclick = () => addRow();

addRow();

import { Music2, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Track = {
  name: string;
  src?: string;
  bpm: number;
  chords: number[][];
  melody: number[];
};

const TRACKS: Track[] = [
  {
    name: "Djimetta — Cuidado",
    src: "/music/djimetta-cuidado.mp3",
    bpm: 104,
    chords: [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
    ],
    melody: [523.25, 587.33, 659.25, 587.33, 523.25, 493.88, 440.0, 493.88],
  },
  {
    name: "Lil Nas X — Old Town Road",
    src: "/music/lil-nas-x-old-town-road.mp3",
    bpm: 112,
    chords: [
      [293.66, 349.23, 440.0],
      [246.94, 293.66, 369.99],
      [196.0, 246.94, 293.66],
      [220.0, 277.18, 329.63],
    ],
    melody: [587.33, 659.25, 739.99, 659.25, 587.33, 523.25, 493.88, 523.25],
  },
  {
    name: "Mr Bow",
    src: "/music/mr-bow.mp3",
    bpm: 96,
    chords: [
      [220.0, 277.18, 329.63],
      [246.94, 311.13, 369.99],
      [261.63, 329.63, 392.0],
      [196.0, 246.94, 293.66],
    ],
    melody: [440.0, 493.88, 587.33, 493.88, 440.0, 392.0, 440.0, 493.88],
  },
];

const STORAGE_KEY = "mozaplay:music:v1";

export function BackgroundMusic() {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [volume, setVolume] = useState(0.22);
  const [expanded, setExpanded] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const generationRef = useRef(0);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (typeof saved.muted === "boolean") setMuted(saved.muted);
      if (typeof saved.volume === "number") setVolume(Math.min(0.45, Math.max(0, saved.volume)));
      if (typeof saved.trackIndex === "number") setTrackIndex(Math.abs(saved.trackIndex) % TRACKS.length);
    } catch {
      // Ignore malformed local preferences.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, volume, trackIndex }));
  }, [muted, volume, trackIndex]);

  const stopMusic = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
      htmlAudioRef.current.currentTime = 0;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.suspend();
    }
  }, []);

  const startMusic = useCallback(async (requestedIndex?: number) => {
    if (typeof window === "undefined") return;

    const nextIndex = requestedIndex ?? trackIndex;
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
      const master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      masterRef.current = master;
    }

    if (track.src) {
      let player = htmlAudioRef.current;
      if (!player) {
        player = new Audio();
        player.preload = "auto";
        htmlAudioRef.current = player;
      }
      player.src = track.src;
      player.loop = true;
      player.volume = muted ? 0 : volume;
      try {
        await player.play();
      } catch (error) {
        console.warn("Não foi possível iniciar a faixa de música:", error);
      }
      return;
    }

    if (ctx.state === "suspended") await ctx.resume();
    if (!masterRef.current) return;

    masterRef.current.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
    generationRef.current += 1;
    const generation = generationRef.current;
    stepRef.current = 0;

    const track = TRACKS[nextIndex];
    const beat = 60 / track.bpm;

    const scheduleStep = () => {
      if (generationRef.current !== generation || !audioContextRef.current || !masterRef.current) return;
      const audio = audioContextRef.current;
      const master = masterRef.current;
      const step = stepRef.current++;
      const chord = track.chords[Math.floor(step / 8) % track.chords.length];
      const melody = track.melody[step % track.melody.length];
      const now = audio.currentTime + 0.015;

      chord.forEach((frequency, index) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = index === 0 ? "triangle" : "sine";
        osc.frequency.value = frequency / (index === 0 ? 2 : 1);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.045 : 0.022, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + beat * 0.92);
        osc.connect(gain).connect(master);
        osc.start(now);
        osc.stop(now + beat);
      });

      const lead = audio.createOscillator();
      const leadGain = audio.createGain();
      lead.type = "sine";
      lead.frequency.value = melody;
      leadGain.gain.setValueAtTime(0.0001, now);
      leadGain.gain.exponentialRampToValueAtTime(0.035, now + 0.018);
      leadGain.gain.exponentialRampToValueAtTime(0.0001, now + beat * 0.72);
      lead.connect(leadGain).connect(master);
      lead.start(now);
      lead.stop(now + beat * 0.78);

      if (step % 2 === 0) {
        const bass = audio.createOscillator();
        const bassGain = audio.createGain();
        bass.type = "triangle";
        bass.frequency.value = chord[0] / 2;
        bassGain.gain.setValueAtTime(0.0001, now);
        bassGain.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, now + beat * 0.45);
        bass.connect(bassGain).connect(master);
        bass.start(now);
        bass.stop(now + beat * 0.5);
      }

      timerRef.current = window.setTimeout(scheduleStep, beat * 1000 * 0.94);
    };

    scheduleStep();
  }, [muted, trackIndex, volume]);

  const toggleMusic = async () => {
    if (enabled) {
      stopMusic();
      setEnabled(false);
    } else {
      setEnabled(true);
      await startMusic();
    }
  };

  const changeTrack = async () => {
    const next = (trackIndex + 1) % TRACKS.length;
    setTrackIndex(next);
    if (enabled) await startMusic(next);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (htmlAudioRef.current) {
      htmlAudioRef.current.volume = muted ? 0 : volume;
    }
    if (masterRef.current && audioContextRef.current) {
      masterRef.current.gain.setTargetAtTime(next ? 0 : volume, audioContextRef.current.currentTime, 0.03);
    }
  };

  useEffect(() => {
    return () => {
      stopMusic();
      if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
      htmlAudioRef.current.src = "";
    }
    if (audioContextRef.current) void audioContextRef.current.close();
    };
  }, [stopMusic]);

  useEffect(() => {
    if (masterRef.current && audioContextRef.current) {
      masterRef.current.gain.setTargetAtTime(
        muted ? 0 : volume,
        audioContextRef.current.currentTime,
        0.03,
      );
    }
  }, [muted, volume]);

  return (
    <div className="fixed bottom-[5.25rem] right-3 z-[65]">
      {expanded && (
        <div className="mb-2 w-64 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Music2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">Música MozaPlay</p>
              <p className="truncate text-[11px] text-muted-foreground">{TRACKS[trackIndex].name}</p>
            </div>
            <button
              type="button"
              onClick={changeTrack}
              className="grid h-8 w-8 place-items-center rounded-xl border border-input"
              aria-label="Próxima música"
              title="Próxima música"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="grid h-8 w-8 place-items-center rounded-xl border border-input"
              aria-label={muted ? "Ativar som" : "Silenciar música"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              aria-label="Volume da música"
              type="range"
              min="0"
              max="0.45"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => void toggleMusic()}
            className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            {enabled ? "Parar música" : "Ligar música"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-xl backdrop-blur"
        aria-label="Abrir música"
        title="Música"
      >
        <Music2 className={enabled && !muted ? "h-5 w-5 animate-pulse" : "h-5 w-5"} />
      </button>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

type Track = {
  name: string;
  src: string;
};

export const MUSIC_ENABLED_KEY = "mozaplay:music:enabled:v2";
export const MUSIC_EVENT = "mozaplay:music-control";

const TRACKS: Track[] = [
  {
    name: "Akon G — Cunhada (Remix feat De La Vega)",
    src: "/music/Akon G - Cunhada(Remix feat De La Vega) (1).m4a",
  },
  {
    name: "BayShit — D E T R O I T",
    src: "/music/BayShit (Nicko Journey & King Cizzy) - D E T R O I T [2021] - MusicaDOPE.CO.MZ (1).mp3",
  },
  {
    name: "Broken Bass & Valentino De La Vega — Magude",
    src: "/music/Broken Bass & Valentino De La Vega - Magude (Original Mix) (1).mp3",
  },
];

// Faixas disponíveis atualmente no repositório, escolhidas por área.
function getTrackIndex(pathname: string) {
  if (pathname.startsWith("/games/ludo")) return 2;
  if (pathname.startsWith("/games/checkers")) return 1;
  if (pathname.startsWith("/games/chess")) return 0;
  if (pathname.startsWith("/rooms")) return 1;
  return 0;
}

const TARGET_VOLUME = 0.8;
const FADE_SECONDS = 3;
const TITLE_SECONDS = 1.5;
const FADE_STEP_MS = 50;
const END_GUARD_SECONDS = 4;

function readEnabledPreference() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MUSIC_ENABLED_KEY) !== "0";
}

export function BackgroundMusic() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [enabled, setEnabled] = useState(readEnabledPreference);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const titleTimerRef = useRef<number | null>(null);
  const trackRef = useRef(0);
  const generationRef = useRef(0);
  const enabledRef = useRef(enabled);
  const currentSrcRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const userUnlockedRef = useRef(false);
  const isTransitioningRef = useRef(false);

  // A música também toca durante partidas; a rota determina a faixa.
  const desiredTrack = getTrackIndex(pathname);

  const clearTimers = useCallback(() => {
    if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
    if (titleTimerRef.current !== null) window.clearTimeout(titleTimerRef.current);
    fadeTimerRef.current = null;
    titleTimerRef.current = null;
  }, []);

  const showTrackTitle = useCallback((name: string) => {
    setCurrentTitle(name);
    if (titleTimerRef.current !== null) window.clearTimeout(titleTimerRef.current);
    titleTimerRef.current = window.setTimeout(() => {
      setCurrentTitle(null);
      titleTimerRef.current = null;
    }, TITLE_SECONDS * 1000);
  }, []);

  const fadeVolume = useCallback(
    (audio: HTMLAudioElement, target: number, durationMs: number, done?: () => void) => {
      if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);

      const start = audio.volume;
      const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
      const delta = target - start;
      let step = 0;

      fadeTimerRef.current = window.setInterval(() => {
        step += 1;
        const progress = Math.min(1, step / steps);
        audio.volume = Math.max(0, Math.min(1, start + delta * progress));

        if (progress >= 1) {
          if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
          done?.();
        }
      }, FADE_STEP_MS);
    },
    [],
  );

  const loadTrack = useCallback(
    async (index: number, fadeIn = true) => {
      const audio = audioRef.current;
      if (!audio || !enabledRef.current || document.hidden) return;

      const track = TRACKS[index];
      if (currentSrcRef.current === track.src && !audio.paused) {
        trackRef.current = index;
        return;
      }
      trackRef.current = index;
      generationRef.current += 1;
      const generation = generationRef.current;
      isTransitioningRef.current = true;

      clearTimers();

      const startPlayback = async () => {
        if (
          generationRef.current !== generation ||
          !enabledRef.current ||
          document.hidden ||
        ) {
          isTransitioningRef.current = false;
          return;
        }

        currentSrcRef.current = track.src;
        audio.src = track.src;
        audio.load();
        audio.volume = fadeIn ? 0 : TARGET_VOLUME;

        try {
          await audio.play();
          playingRef.current = true;
          userUnlockedRef.current = true;
          showTrackTitle(track.name);
          if (fadeIn) fadeVolume(audio, TARGET_VOLUME, FADE_SECONDS * 1000);
        } catch (error) {
          playingRef.current = false;
          userUnlockedRef.current = false;
          console.warn("[Music] Reprodução bloqueada ou ficheiro indisponível:", error);
          isTransitioningRef.current = false;
        }

        isTransitioningRef.current = false;
      };

      if (audio.src && !audio.paused && currentSrcRef.current) {
        fadeVolume(audio, 0, FADE_SECONDS * 1000, () => {
          if (generationRef.current !== generation) return;
          void startPlayback();
        });
      } else {
        await startPlayback();
      }
    },
    [clearTimers, fadeVolume, showTrackTitle],
  );

  const stopPlayback = useCallback(
    (keepPosition = true) => {
      const audio = audioRef.current;
      generationRef.current += 1;
      clearTimers();
      playingRef.current = false;
      isTransitioningRef.current = false;

      if (!audio) return;

      if (keepPosition) {
        audio.pause();
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
      audio.volume = 0;
      setCurrentTitle(null);
    },
    [clearTimers],
  );

  const startPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !enabledRef.current || document.hidden) return;

    if (!audio.src || !currentSrcRef.current || currentSrcRef.current !== TRACKS[desiredTrack].src) {
      void loadTrack(desiredTrack, true);
      return;
    }

    audio.volume = Math.max(audio.volume, 0);
    void audio
      .play()
      .then(() => {
        playingRef.current = true;
        userUnlockedRef.current = true;
        fadeVolume(audio, TARGET_VOLUME, FADE_SECONDS * 1000);
      })
      .catch((error) => {
        playingRef.current = false;
        userUnlockedRef.current = false;
        console.warn("[Music] Reprodução aguardando gesto do utilizador ou fonte indisponível:", error);
      });
  }, [fadeVolume, loadTrack, desiredTrack]);

  const setMusicEnabled = useCallback(
    (value: boolean) => {
      enabledRef.current = value;
      setEnabled(value);
      window.localStorage.setItem(MUSIC_ENABLED_KEY, value ? "1" : "0");
      window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: { enabled: value } }));

      if (!value || document.hidden) {
        stopPlayback();
      } else {
        startPlayback();
      }
    },
    [startPlayback, stopPlayback],
  );

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = 0;
    audio.setAttribute("playsinline", "true");
    audioRef.current = audio;

    const onError = () => {
      // Evita um ciclo infinito se uma faixa estiver indisponível.
      console.warn("[Music] Não foi possível carregar a faixa atual.");
    };

    const onPlay = () => {
      playingRef.current = true;
    };

    const onPause = () => {
      playingRef.current = false;
    };

    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!enabled || document.hidden) {
      stopPlayback();
      return;
    }
    void loadTrack(desiredTrack, true);
  }, [pathname, desiredTrack, enabled, loadTrack, stopPlayback]);

  useEffect(() => {
    const onControl = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled !== "boolean") return;

      enabledRef.current = detail.enabled;
      setEnabled(detail.enabled);

      if (!detail.enabled || document.hidden) {
        stopPlayback();
      } else {
        startPlayback();
      }
    };

    window.addEventListener(MUSIC_EVENT, onControl);
    return () => window.removeEventListener(MUSIC_EVENT, onControl);
  }, [startPlayback, stopPlayback]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;

      if (detail?.action === "toggle") {
        setMusicEnabled(!enabledRef.current);
      } else if (detail?.action === "stop") {
        setMusicEnabled(false);
      } else if (detail?.action === "start") {
        setMusicEnabled(true);
      } else if (detail?.action === "next" && enabledRef.current) {
        const next = (trackRef.current + 1) % TRACKS.length;
        void loadTrack(next, true);
      }
    };

    window.addEventListener(MUSIC_EVENT, onRequest);
    return () => window.removeEventListener(MUSIC_EVENT, onRequest);
  }, [loadTrack, setMusicEnabled]);

  useEffect(() => {
    const unlock = () => {
      if (userUnlockedRef.current || !enabledRef.current || document.hidden) return;
      startPlayback();
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [startPlayback]);

  useEffect(() => {
    const resume = () => {
      if (!document.hidden && enabledRef.current) {
        startPlayback();
      }
    };

    const pause = () => stopPlayback();

    const onVisibilityChange = () => {
      if (document.hidden) pause();
      else resume();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", pause);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", pause);
    };
  }, [pathname, startPlayback, stopPlayback]);

  return (
    <>
      {currentTitle && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {currentTitle}
        </div>
      )}
    </>
  );
}

export function getMusicEnabled() {
  return readEnabledPreference();
}

export function requestMusicControl(action: "toggle" | "start" | "stop" | "next") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: { action } }));
}

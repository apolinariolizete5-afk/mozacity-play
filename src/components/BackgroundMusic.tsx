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
    src: "/music/cunhada-remix.m4a",
  },
  {
    name: "BayShit — D E T R O I T",
    src: "/music/detroit.mp3",
  },
  {
    name: "Broken Bass & Valentino De La Vega — Magude",
    src: "/music/magude.mp3",
  },
];

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
  const nextTrackTimerRef = useRef<number | null>(null);
  const trackRef = useRef(0);
  const generationRef = useRef(0);
  const enabledRef = useRef(enabled);
  const currentSrcRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const userUnlockedRef = useRef(false);
  const isTransitioningRef = useRef(false);

  const isGame = pathname.startsWith("/games/");

  const clearTimers = useCallback(() => {
    if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
    if (titleTimerRef.current !== null) window.clearTimeout(titleTimerRef.current);
    if (nextTrackTimerRef.current !== null) window.clearTimeout(nextTrackTimerRef.current);
    fadeTimerRef.current = null;
    titleTimerRef.current = null;
    nextTrackTimerRef.current = null;
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

  const chooseNextTrack = useCallback(() => {
    if (TRACKS.length <= 1) return 0;
    let next = Math.floor(Math.random() * TRACKS.length);
    while (next === trackRef.current) {
      next = Math.floor(Math.random() * TRACKS.length);
    }
    return next;
  }, []);

  const loadTrack = useCallback(
    async (index: number, fadeIn = true) => {
      const audio = audioRef.current;
      if (!audio || !enabledRef.current || document.hidden || isGame) return;

      const track = TRACKS[index];
      trackRef.current = index;
      generationRef.current += 1;
      const generation = generationRef.current;
      isTransitioningRef.current = true;

      clearTimers();
      showTrackTitle(track.name);

      const startPlayback = async () => {
        if (
          generationRef.current !== generation ||
          !enabledRef.current ||
          document.hidden ||
          isGame
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
    [clearTimers, fadeVolume, isGame, showTrackTitle],
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
    if (!audio || !enabledRef.current || document.hidden || isGame) return;

    if (!audio.src || !currentSrcRef.current) {
      void loadTrack(trackRef.current, true);
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
  }, [fadeVolume, isGame, loadTrack]);

  const setMusicEnabled = useCallback(
    (value: boolean) => {
      enabledRef.current = value;
      setEnabled(value);
      window.localStorage.setItem(MUSIC_ENABLED_KEY, value ? "1" : "0");
      window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: { enabled: value } }));

      if (!value || isGame || document.hidden) {
        stopPlayback();
      } else {
        startPlayback();
      }
    },
    [isGame, startPlayback, stopPlayback],
  );

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = 0;
    audio.setAttribute("playsinline", "true");
    audioRef.current = audio;

    const onEnded = () => {
      if (
        isTransitioningRef.current ||
        !enabledRef.current ||
        document.hidden ||
        isGame
      ) {
        return;
      }
      void loadTrack(chooseNextTrack(), true);
    };

    const onTimeUpdate = () => {
      if (
        !audio.duration ||
        !Number.isFinite(audio.duration) ||
        audio.duration - audio.currentTime > END_GUARD_SECONDS ||
        isTransitioningRef.current ||
        !enabledRef.current ||
        isGame
      ) {
        return;
      }

      if (nextTrackTimerRef.current !== null) return;

      nextTrackTimerRef.current = window.setTimeout(() => {
        nextTrackTimerRef.current = null;
        if (!enabledRef.current || document.hidden || isGame) return;
        void loadTrack(chooseNextTrack(), true);
      }, Math.max(0, (audio.duration - audio.currentTime - FADE_SECONDS) * 1000));
    };

    const onPlay = () => {
      playingRef.current = true;
    };

    const onPause = () => {
      playingRef.current = false;
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    if (enabledRef.current && !isGame) {
      void loadTrack(trackRef.current, true);
    }

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      clearTimers();
    };
  }, [chooseNextTrack, clearTimers, isGame, loadTrack]);

  useEffect(() => {
    if (isGame || !enabled) {
      stopPlayback();
      return;
    }

    startPlayback();
  }, [isGame, enabled, startPlayback, stopPlayback]);

  useEffect(() => {
    const onControl = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled !== "boolean") return;

      enabledRef.current = detail.enabled;
      setEnabled(detail.enabled);

      if (!detail.enabled || isGame || document.hidden) {
        stopPlayback();
      } else {
        startPlayback();
      }
    };

    window.addEventListener(MUSIC_EVENT, onControl);
    return () => window.removeEventListener(MUSIC_EVENT, onControl);
  }, [isGame, startPlayback, stopPlayback]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;

      if (detail?.action === "toggle") {
        setMusicEnabled(!enabledRef.current);
      } else if (detail?.action === "stop") {
        setMusicEnabled(false);
      } else if (detail?.action === "start") {
        setMusicEnabled(true);
      } else if (detail?.action === "next" && enabledRef.current && !isGame) {
        void loadTrack((trackRef.current + 1) % TRACKS.length, true);
      }
    };

    window.addEventListener(MUSIC_EVENT, onRequest);
    return () => window.removeEventListener(MUSIC_EVENT, onRequest);
  }, [isGame, loadTrack, setMusicEnabled]);

  useEffect(() => {
    const unlock = () => {
      if (userUnlockedRef.current || !enabledRef.current || isGame || document.hidden) return;
      startPlayback();
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [isGame, startPlayback]);

  useEffect(() => {
    const resume = () => {
      if (!document.hidden && enabledRef.current && !pathname.startsWith("/games/")) {
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
      {currentTitle && !isGame && (
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

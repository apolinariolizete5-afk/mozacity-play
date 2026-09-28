import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

type Track = {
  name: string;
  youtubeId: string;
};

type YouTubePlayer = {
  loadVideoById: (options: { videoId: string; startSeconds?: number; endSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          width: number;
          height: number;
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
            onAutoplayBlocked?: () => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const MUSIC_ENABLED_KEY = "mozaplay:music:enabled:v2";
export const MUSIC_EVENT = "mozaplay:music-control";

const TRACKS: Track[] = [
  { name: "Djimetta — Cuidado", youtubeId: "eLimdnRXCf4" },
  { name: "Lil Nas X — Old Town Road", youtubeId: "r7qovpFAGrQ" },
  { name: "Mr Bow", youtubeId: "W276kT7uMao" },
];

const SEGMENT_SECONDS = 30;
const FADE_SECONDS = 3;
const TITLE_SECONDS = 1.5;

function readEnabledPreference() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MUSIC_ENABLED_KEY) !== "0";
}

function loadYouTubeApi() {
  return new Promise<void>((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
}

export function BackgroundMusic() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [enabled, setEnabled] = useState(readEnabledPreference);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const timerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const titleTimerRef = useRef<number | null>(null);
  const trackRef = useRef(0);
  const generationRef = useRef(0);
  const enabledRef = useRef(enabled);
  const playingRef = useRef(false);
  const playerReadyRef = useRef(false);

  const isGame = pathname.startsWith("/games/");

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
    if (titleTimerRef.current !== null) window.clearTimeout(titleTimerRef.current);
    timerRef.current = null;
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

  const fadeTo = useCallback((target: number, durationMs: number, done?: () => void) => {
    const player = playerRef.current;
    if (!player) {
      done?.();
      return;
    }

    if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);

    const steps = Math.max(1, Math.round(durationMs / 50));
    const start = 100;
    const delta = target - start;
    let step = 0;

    player.setVolume(start);

    fadeTimerRef.current = window.setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / steps);
      player.setVolume(Math.round(start + delta * progress));

      if (progress >= 1) {
        if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
        done?.();
      }
    }, 50);
  }, []);

  const playSegment = useCallback(async (requestedIndex?: number) => {
    if (typeof window === "undefined" || !enabledRef.current || document.hidden || isGame) return;

    const nextIndex = requestedIndex ?? trackRef.current;
    const track = TRACKS[nextIndex];
    trackRef.current = nextIndex;

    generationRef.current += 1;
    const generation = generationRef.current;
    clearTimers();
    showTrackTitle(track.name);

    await loadYouTubeApi();
    if (generationRef.current !== generation || !enabledRef.current || document.hidden || isGame) return;

    const start = Math.floor(Math.random() * 91);
    const player = playerRef.current;

    if (!player && playerHostRef.current && window.YT?.Player) {
      playerRef.current = new window.YT.Player(playerHostRef.current, {
        width: 200,
        height: 200,
        videoId: track.youtubeId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
          start,
          end: start + SEGMENT_SECONDS,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            playerReadyRef.current = true;
            if (!enabledRef.current || document.hidden || isGame) return;
            target.setVolume(0);
            target.playVideo();
            playingRef.current = true;
            fadeTo(100, 1800);
          },
          onAutoplayBlocked: () => {
            playingRef.current = false;
          },
        },
      });
    } else if (playerRef.current && playerReadyRef.current) {
      const oldGeneration = generationRef.current;
      fadeTo(0, FADE_SECONDS * 1000, () => {
        if (generationRef.current !== oldGeneration || !enabledRef.current || document.hidden || isGame) return;
        playerRef.current?.loadVideoById({
          videoId: track.youtubeId,
          startSeconds: start,
          endSeconds: start + SEGMENT_SECONDS,
        });
        playerRef.current?.setVolume(0);
        playerRef.current?.playVideo();
        playingRef.current = true;
        fadeTo(100, 1800);
      });
      return;
    }

    timerRef.current = window.setTimeout(() => {
      if (generationRef.current !== generation || !enabledRef.current || document.hidden || isGame) return;
      const next = Math.random() < 0.35
        ? trackRef.current
        : Math.floor(Math.random() * TRACKS.length);
      playSegment(next);
    }, (SEGMENT_SECONDS - FADE_SECONDS) * 1000);
  }, [clearTimers, fadeTo, isGame, showTrackTitle]);

  const stopPlayback = useCallback(() => {
    generationRef.current += 1;
    clearTimers();
    playingRef.current = false;
    playerRef.current?.pauseVideo();
    playerRef.current?.setVolume(0);
    setCurrentTitle(null);
  }, [clearTimers]);

  const setMusicEnabled = useCallback((value: boolean) => {
    enabledRef.current = value;
    setEnabled(value);
    window.localStorage.setItem(MUSIC_ENABLED_KEY, value ? "1" : "0");
    window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: { enabled: value } }));

    if (!value || isGame || document.hidden) {
      stopPlayback();
    } else {
      playSegment();
    }
  }, [isGame, playSegment, stopPlayback]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (isGame || !enabled) {
      stopPlayback();
      return;
    }
    playSegment();
    return stopPlayback;
  }, [isGame, enabled, playSegment, stopPlayback]);

  useEffect(() => {
    const onControl = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled !== "boolean") return;
      enabledRef.current = detail.enabled;
      setEnabled(detail.enabled);
      if (!detail.enabled || isGame || document.hidden) stopPlayback();
      else playSegment();
    };

    window.addEventListener(MUSIC_EVENT, onControl);
    return () => window.removeEventListener(MUSIC_EVENT, onControl);
  }, [isGame, playSegment, stopPlayback]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      if (detail?.action === "toggle") setMusicEnabled(!enabledRef.current);
      if (detail?.action === "stop") setMusicEnabled(false);
      if (detail?.action === "start") setMusicEnabled(true);
      if (detail?.action === "next" && enabledRef.current && !isGame) {
        playSegment((trackRef.current + 1) % TRACKS.length);
      }
    };
    window.addEventListener(MUSIC_EVENT, onRequest);
    return () => window.removeEventListener(MUSIC_EVENT, onRequest);
  }, [isGame, playSegment, setMusicEnabled]);

  useEffect(() => {
    const unlock = () => {
      if (!enabledRef.current || isGame || document.hidden) return;
      const player = playerRef.current;
      if (player && playerReadyRef.current && !playingRef.current) {
        player.playVideo();
        playingRef.current = true;
        fadeTo(100, 1000);
      }
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [fadeTo, isGame]);

  useEffect(() => {
    const resume = () => {
      if (!document.hidden && enabledRef.current && !pathname.startsWith("/games/")) {
        const player = playerRef.current;
        if (player && playerReadyRef.current) {
          player.playVideo();
          playingRef.current = true;
          fadeTo(100, 1000);
        } else {
          playSegment();
        }
      }
    };
    const pause = () => stopPlayback();

    const onVisibilityChange = () => {
      if (document.hidden) pause();
      else resume();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", pause);
    window.addEventListener("beforeunload", pause);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("beforeunload", pause);
    };
  }, [fadeTo, pathname, playSegment, stopPlayback]);

  useEffect(() => {
    return () => {
      clearTimers();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [clearTimers]);

  return (
    <>
      <div
        ref={playerHostRef}
        aria-hidden="true"
        className="pointer-events-none fixed bottom-[-1px] left-[-1px] h-[200px] w-[200px] opacity-0"
      />
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

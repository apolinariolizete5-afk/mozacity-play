import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

type Track = {
  name: string;
  youtubeId: string;
};

export const MUSIC_ENABLED_KEY = "mozaplay:music:enabled:v2";
export const MUSIC_EVENT = "mozaplay:music-control";

const TRACKS: Track[] = [
  { name: "Djimetta — Cuidado", youtubeId: "W276kT7uMao" },
  { name: "Lil Nas X — Old Town Road", youtubeId: "r7qovpFAGrQ" },
  { name: "Mr Bow", youtubeId: "eLimdnRXCf4" },
];

const SEGMENT_SECONDS = 30;

function readEnabledPreference() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MUSIC_ENABLED_KEY) !== "0";
}

export function BackgroundMusic() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [enabled, setEnabled] = useState(readEnabledPreference);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const trackRef = useRef(0);
  const generationRef = useRef(0);
  const enabledRef = useRef(enabled);

  const isGame = pathname.startsWith("/games/");

  const stopPlayback = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (frameRef.current) frameRef.current.src = "about:blank";
  }, []);

  const playSegment = useCallback((requestedIndex?: number) => {
    if (typeof window === "undefined" || !enabledRef.current || document.hidden) return;

    const nextIndex = requestedIndex ?? trackRef.current;
    const track = TRACKS[nextIndex];
    trackRef.current = nextIndex;

    const start = Math.floor(Math.random() * 91);
    const params = new URLSearchParams({
      autoplay: "1",
      controls: "0",
      disablekb: "1",
      fs: "0",
      playsinline: "1",
      rel: "0",
      start: String(start),
      end: String(start + SEGMENT_SECONDS),
      origin: window.location.origin,
    });

    generationRef.current += 1;
    const generation = generationRef.current;

    if (frameRef.current) {
      frameRef.current.src =
        `https://www.youtube-nocookie.com/embed/${track.youtubeId}?${params.toString()}`;
    }

    timerRef.current = window.setTimeout(() => {
      if (generationRef.current !== generation || !enabledRef.current || document.hidden) return;
      const next = Math.random() < 0.35
        ? trackRef.current
        : Math.floor(Math.random() * TRACKS.length);
      playSegment(next);
    }, SEGMENT_SECONDS * 1000);
  }, []);

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
    if (isGame || !enabled) {
      stopPlayback();
      return;
    }
    playSegment();
    return stopPlayback;
  }, [isGame, enabled, playSegment, stopPlayback]);

  useEffect(() => {
    const resume = () => {
      if (!document.hidden && enabledRef.current && !pathname.startsWith("/games/")) {
        playSegment();
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
  }, [pathname, playSegment, stopPlayback]);

  useEffect(() => {
    const unlock = () => {
      if (enabledRef.current && !pathname.startsWith("/games/") && !document.hidden) {
        playSegment();
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [pathname, playSegment]);

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

  return (
    <iframe
      ref={frameRef}
      title="Música MozaPlay"
      className="pointer-events-none fixed bottom-[-1px] left-[-1px] h-[200px] w-[200px] opacity-0"
      allow="autoplay; encrypted-media"
      src="about:blank"
    />
  );
}

export function getMusicEnabled() {
  return readEnabledPreference();
}

export function requestMusicControl(action: "toggle" | "start" | "stop" | "next") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: { action } }));
}

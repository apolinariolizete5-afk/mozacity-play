import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { Button, Pill } from "@/components/ui/primitives";
import { supabase } from "@/integrations/supabase/client";

type VoiceChatProps = {
  roomId: string;
  userId: string;
  enabled?: boolean;
};

function getRtcConfig(): RTCConfiguration {
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.unshift({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return { iceServers };
}

export function VoiceChat({ roomId, userId, enabled = true }: VoiceChatProps) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [supported, setSupported] = useState(true);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }

    const channel = supabase.channel(`voice:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    const createPeer = () => {
      const peer = new RTCPeerConnection(getRtcConfig());
      peerRef.current = peer;
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          void channel.send({
            type: "broadcast",
            event: "ice",
            payload: { from: userId, candidate: event.candidate },
          });
        }
      };
      peer.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.muted = false;
          remoteAudioRef.current.volume = 1;
          void remoteAudioRef.current.play().catch(() => {
            // The audio element will be started again after the next user gesture.
          });
        }
        setConnected(true);
        setConnecting(false);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setConnected(true);
          setConnecting(false);
        }
        if ([ "failed", "closed", "disconnected" ].includes(peer.connectionState)) {
          setConnected(false);
        }
      };
      return peer;
    };

    channel
      .on("broadcast", { event: "hello" }, async ({ payload }) => {
        if (payload?.from === userId || !streamRef.current) return;
        // Only one side creates the offer. This prevents simultaneous-offer glare
        // when both players press "Ligar" at nearly the same time.
        if (String(userId) > String(payload.from)) return;
        const peer = peerRef.current ?? createPeer();
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await channel.send({
          type: "broadcast",
          event: "offer",
          payload: { from: userId, to: payload.from, description: peer.localDescription },
        });
      })
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        if (payload?.to !== userId || !streamRef.current) return;
        const peer = peerRef.current ?? createPeer();
        await peer.setRemoteDescription(payload.description);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        for (const candidate of pendingCandidatesRef.current.splice(0)) {
          try { await peer.addIceCandidate(candidate); } catch { /* ignore stale ICE */ }
        }
        await channel.send({
          type: "broadcast",
          event: "answer",
          payload: { from: userId, to: payload.from, description: peer.localDescription },
        });
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload?.to !== userId || !peerRef.current) return;
        await peerRef.current.setRemoteDescription(payload.description);
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        if (payload?.from === userId || !peerRef.current || !payload?.candidate) return;
        try {
          const peer = peerRef.current;
          if (!peer.remoteDescription) {
            pendingCandidatesRef.current.push(payload.candidate);
          } else {
            await peer.addIceCandidate(payload.candidate);
          }
        } catch {
          // The connection may have closed before the candidate arrived.
        }
      });

    void channel.subscribe();

    return () => {
      void channel.unsubscribe();
      channelRef.current = null;
      peerRef.current?.close();
      peerRef.current = null;
      pendingCandidatesRef.current = [];
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [enabled, roomId, userId]);

  const start = async () => {
    if (!supported || !channelRef.current) return;
    try {
      setConnecting(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const peer = peerRef.current ?? createPeer();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      await channelRef.current.send({
        type: "broadcast",
        event: "hello",
        payload: { from: userId },
      });
      setMuted(false);
    } catch {
      setConnecting(false);
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    pendingCandidatesRef.current = [];
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setConnected(false);
    setConnecting(false);
  };

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  if (!supported) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card/90 p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {connected ? <Volume2 className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold">Voz na partida</p>
          <p className="text-[10px] text-muted-foreground">
            {connected ? "Ligado" : connecting ? "A ligar..." : "Microfone desligado"}
          </p>
        </div>
      </div>
      {!streamRef.current ? (
        <Button size="sm" onClick={start} disabled={connecting}>
          <Phone className="h-4 w-4" /> Ligar
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Pill tone={muted ? "muted" : "success"}>{muted ? "Mudo" : "Ativo"}</Pill>
          <Button size="sm" variant="ghost" onClick={toggleMute} aria-label={muted ? "Ativar microfone" : "Silenciar microfone"}>
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={stop} aria-label="Desligar voz">
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay playsInline controls={false} aria-hidden="true" className="sr-only" />
    </div>
  );
}

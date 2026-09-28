import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneCall, PhoneIncoming, PhoneOff, Volume2 } from "lucide-react";
import { Button, Pill } from "@/components/ui/primitives";
import { supabase } from "@/integrations/supabase/client";

type VoiceChatProps = {
  roomId: string;
  userId: string;
  userName?: string;
  enabled?: boolean;
};

type CallState = "idle" | "calling" | "incoming" | "connected";

function getRtcConfig(): RTCConfiguration {
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  } else {
    iceServers.push({
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return { iceServers };
}

export function VoiceChat({ roomId, userId, userName = "Jogador", enabled = true }: VoiceChatProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callerName, setCallerName] = useState("");
  const [callerId, setCallerId] = useState("");
  const [muted, setMuted] = useState(false);
  const [supported, setSupported] = useState(true);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanUp = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    pendingCandidatesRef.current = [];
  };

  const setupPeer = (targetUserId: string) => {
    const peer = new RTCPeerConnection(getRtcConfig());
    peerRef.current = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: "call_ice",
          payload: { from: userId, to: targetUserId, candidate: event.candidate },
        });
      }
    };

    peer.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1;
        void remoteAudioRef.current.play().catch(() => {});
      }
      setCallState("connected");
    };

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => peer.addTrack(track, streamRef.current!));
    }

    return peer;
  };

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }

    const channel = supabase.channel(`voice:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "call_invite" }, ({ payload }) => {
        if (payload?.to === userId || (!payload?.to && payload?.from !== userId)) {
          if (callState === "idle") {
            setCallerId(payload.from);
            setCallerName(payload.fromName || "Adversário");
            setCallState("incoming");
          }
        }
      })
      .on("broadcast", { event: "call_rejected" }, ({ payload }) => {
        if (payload?.to === userId) {
          cleanUp();
          setCallState("idle");
        }
      })
      .on("broadcast", { event: "call_ended" }, () => {
        cleanUp();
        setCallState("idle");
      })
      .on("broadcast", { event: "call_offer" }, async ({ payload }) => {
        if (payload?.to !== userId) return;
        try {
          const peer = peerRef.current ?? setupPeer(payload.from);
          await peer.setRemoteDescription(new RTCSessionDescription(payload.description));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);

          for (const cand of pendingCandidatesRef.current.splice(0)) {
            try { await peer.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
          }

          await channel.send({
            type: "broadcast",
            event: "call_answer",
            payload: { from: userId, to: payload.from, description: peer.localDescription },
          });
        } catch (e) {
          console.error("[Voice] Erro ao responder oferta:", e);
        }
      })
      .on("broadcast", { event: "call_answer" }, async ({ payload }) => {
        if (payload?.to !== userId) return;
        const peer = peerRef.current;
        if (peer && payload.description) {
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(payload.description));
            for (const cand of pendingCandidatesRef.current.splice(0)) {
              try { await peer.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
            }
          } catch (e) {
            console.error("[Voice] Erro ao aplicar resposta:", e);
          }
        }
      })
      .on("broadcast", { event: "call_ice" }, async ({ payload }) => {
        if (payload?.to !== userId) return;
        const peer = peerRef.current;
        if (peer && peer.remoteDescription && payload.candidate) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {}
        } else if (payload.candidate) {
          pendingCandidatesRef.current.push(payload.candidate);
        }
      });

    void channel.subscribe();

    return () => {
      cleanUp();
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId, userId, enabled, callState]);

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setCallState("calling");

      if (channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: "call_invite",
          payload: { from: userId, fromName: userName },
        });
      }
    } catch {
      alert("Precisas de permitir o microfone para ligar.");
      setCallState("idle");
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const peer = setupPeer(callerId);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      if (channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: "call_offer",
          payload: { from: userId, to: callerId, description: peer.localDescription },
        });
      }
      setCallState("connected");
    } catch {
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (channelRef.current && callerId) {
      void channelRef.current.send({
        type: "broadcast",
        event: "call_rejected",
        payload: { from: userId, to: callerId },
      });
    }
    cleanUp();
    setCallState("idle");
  };

  const hangUp = () => {
    if (channelRef.current) {
      void channelRef.current.send({
        type: "broadcast",
        event: "call_ended",
        payload: { from: userId },
      });
    }
    cleanUp();
    setCallState("idle");
  };

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMuted(!audioTrack.enabled);
      }
    }
  };

  if (!supported) return null;

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {callState === "idle" && (
        <Button size="sm" variant="outline" onClick={startCall} className="gap-2 bg-card/90 backdrop-blur">
          <Phone className="h-4 w-4 text-emerald-500" />
          <span>Ligar</span>
        </Button>
      )}

      {callState === "calling" && (
        <div className="flex items-center gap-2 bg-card/90 p-1.5 rounded-2xl border border-border">
          <Pill tone="accent" className="animate-pulse gap-1 text-xs">
            <PhoneCall className="h-3 w-3" /> A chamar...
          </Pill>
          <Button size="sm" variant="danger" onClick={hangUp}>
            Cancelar
          </Button>
        </div>
      )}

      {callState === "incoming" && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-zinc-950 border border-emerald-500/50 p-4 shadow-2xl backdrop-blur-md animate-pulse">
          <PhoneIncoming className="h-6 w-6 text-emerald-400" />
          <div className="text-left">
            <p className="text-xs font-bold text-white">{callerName}</p>
            <p className="text-[11px] text-zinc-400">Quer falar por voz</p>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Button size="sm" variant="primary" className="bg-emerald-600 hover:bg-emerald-500 text-xs px-3 font-bold" onClick={acceptCall}>
              Atender
            </Button>
            <Button size="sm" variant="danger" className="text-xs px-3" onClick={rejectCall}>
              Recusar
            </Button>
          </div>
        </div>
      )}

      {callState === "connected" && (
        <div className="flex items-center gap-2 bg-card/90 p-1.5 rounded-2xl border border-emerald-500/30">
          <Pill tone="success" className="gap-1 text-xs">
            <Volume2 className="h-3 w-3" /> Em chamada
          </Pill>
          <Button size="sm" variant="outline" onClick={toggleMute} title={muted ? "Ativar microfone" : "Silenciar"}>
            {muted ? <MicOff className="h-4 w-4 text-rose-500" /> : <Mic className="h-4 w-4 text-emerald-500" />}
          </Button>
          <Button size="sm" variant="danger" onClick={hangUp} title="Desligar chamada">
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}

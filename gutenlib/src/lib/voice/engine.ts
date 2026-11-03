import type { Socket } from "socket.io-client";
import { ICE_SERVERS } from "./config";

export type PeerHealth = {
  connection: RTCPeerConnectionState;
  ice: RTCIceConnectionState;
  signaling: RTCSignalingState;
  receiving: boolean;
  candidateType?: string;
};

type Peer = {
  pc: RTCPeerConnection;
  sender: RTCRtpSender;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingAnswer: boolean;
  candidates: RTCIceCandidateInit[];
  queue: Promise<void>;
  stream: MediaStream;
  restartTimer?: ReturnType<typeof setTimeout>;
};

type Signal = { fromPeerId: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type Events = {
  stream: (id: string, stream: MediaStream) => void;
  health: (id: string, health: PeerHealth) => void;
  error: (message: string) => void;
};

/** Owns WebRTC only. Each peer has one transceiver and a serialized signaling queue. */
export class VoiceEngine {
  private peers = new Map<string, Peer>();
  private track: MediaStreamTrack | null = null;
  private closed = false;
  private signal = (payload: Signal) => {
    const peer = this.peers.get(payload.fromPeerId);
    if (!peer || this.closed) return;
    peer.queue = peer.queue
      .then(() => this.receive(payload.fromPeerId, peer, payload))
      .catch(() => {
        if (!this.closed && peer.pc.signalingState !== "closed") {
          this.events.error("تعذر توصيل صوت أحد المشاركين. جرّب إعادة الاتصال.");
        }
      });
  };

  constructor(private socket: Socket, private selfId: string, private events: Events) {
    for (const event of ["webrtc-offer", "webrtc-answer", "webrtc-ice"]) socket.on(event, this.signal);
  }

  add(id: string) {
    if (this.closed || id === this.selfId || this.peers.has(id)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const sender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    const peer: Peer = {
      pc,
      sender,
      makingOffer: false,
      ignoreOffer: false,
      settingAnswer: false,
      candidates: [],
      queue: Promise.resolve(),
      stream: new MediaStream(),
    };
    this.peers.set(id, peer);
    if (this.track) void sender.replaceTrack(this.track);

    const inspectCandidateType = async (): Promise<string | undefined> => {
      try {
        const stats = await pc.getStats();
        let type: string | undefined;
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            const local = stats.get(report.localCandidateId);
            if (local?.candidateType) type = local.candidateType;
          }
        });
        return type;
      } catch {
        return undefined;
      }
    };

    const publish = async () => {
      let candidateType: string | undefined;
      if (pc.iceConnectionState === "connected" || pc.connectionState === "connected") {
        candidateType = await inspectCandidateType();
      }
      this.events.health(id, {
        connection: pc.connectionState,
        ice: pc.iceConnectionState,
        signaling: pc.signalingState,
        receiving: peer.stream.getAudioTracks().some((t) => t.readyState === "live"),
        candidateType,
      });
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && !this.closed) {
        this.socket.emit("webrtc-ice", { toPeerId: id, candidate: candidate.toJSON() });
      }
    };

    pc.ontrack = ({ track }) => {
      peer.stream.addTrack(track);
      this.events.stream(id, peer.stream);
      void publish();
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (!this.closed && pc.localDescription) {
          this.socket.emit("webrtc-offer", { toPeerId: id, sdp: pc.localDescription.toJSON() });
        }
      } catch {
        if (!this.closed && pc.signalingState !== "closed") {
          this.events.error("تعذر بدء الاتصال الصوتي. أعد الاتصال.");
        }
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onconnectionstatechange = () => {
      void publish();
      if (pc.connectionState === "failed") pc.restartIce();
      if (pc.connectionState === "disconnected" && !peer.restartTimer) {
        peer.restartTimer = setTimeout(() => {
          peer.restartTimer = undefined;
          if (pc.connectionState === "disconnected") pc.restartIce();
        }, 4000);
      }
      if (pc.connectionState === "connected") {
        clearTimeout(peer.restartTimer);
        peer.restartTimer = undefined;
      }
    };

    pc.oniceconnectionstatechange = () => {
      void publish();
    };
    pc.onsignalingstatechange = () => {
      void publish();
    };
    void publish();
  }

  async setTrack(track: MediaStreamTrack | null) {
    this.track = track;
    await Promise.all([...this.peers.values()].map((p) => p.sender.replaceTrack(track)));
  }

  remove(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    clearTimeout(p.restartTimer);
    p.pc.onconnectionstatechange = null;
    p.pc.oniceconnectionstatechange = null;
    p.pc.onsignalingstatechange = null;
    p.pc.onnegotiationneeded = null;
    p.pc.ontrack = null;
    p.pc.onicecandidate = null;
    p.pc.close();
    this.peers.delete(id);
  }

  close() {
    this.closed = true;
    for (const event of ["webrtc-offer", "webrtc-answer", "webrtc-ice"]) this.socket.off(event, this.signal);
    for (const id of this.peers.keys()) this.remove(id);
    this.track = null;
  }

  private async receive(id: string, peer: Peer, { sdp, candidate }: Signal) {
    const pc = peer.pc;
    if (this.closed || pc.signalingState === "closed") return;
    if (sdp) {
      const ready = !peer.makingOffer && (pc.signalingState === "stable" || peer.settingAnswer);
      const collision = sdp.type === "offer" && !ready;
      // Stable ordering makes exactly one side polite, including simultaneous joins.
      peer.ignoreOffer = this.selfId < id && collision;
      if (peer.ignoreOffer) {
        peer.candidates = [];
        return;
      }
      peer.settingAnswer = sdp.type === "answer";
      try {
        if (collision) {
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch {
            // Ignore rollback if browser auto-handles
          }
        }
        await pc.setRemoteDescription(sdp);
      } finally {
        peer.settingAnswer = false;
      }
      for (const ice of peer.candidates.splice(0)) {
        try {
          await pc.addIceCandidate(ice);
        } catch {
          /* a rolled-back offer can leave stale candidates */
        }
      }
      if (sdp.type === "offer") {
        await pc.setLocalDescription();
        this.socket.emit("webrtc-answer", { toPeerId: id, sdp: pc.localDescription?.toJSON() });
      }
    } else if (candidate && !peer.ignoreOffer) {
      if (pc.remoteDescription) await pc.addIceCandidate(candidate);
      else if (peer.candidates.length < 128) peer.candidates.push(candidate);
    }
  }
}

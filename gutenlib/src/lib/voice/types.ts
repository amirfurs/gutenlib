export type VoiceRole = "host" | "speaker" | "listener";

export type ActiveBook =
  | {
      source: "gutendex";
      id: number;
      title: string;
      author: string;
      coverUrl: string | null;
      lang?: string;
    }
  | {
      source: "abl";
      id: string;
      title: string;
      author: string;
      coverUrl: string | null;
      lang?: string;
    }
  | null;

export type PeerInfo = {
  peerId: string;
  displayName: string;
  role: VoiceRole;
  handRaised?: boolean;
  micOn?: boolean;
};

export type ReadingState =
  | { kind: "chunk"; index: number }
  | { kind: "page"; index: number };

export type JoinedPayload = {
  roomId: string;
  selfPeerId: string;
  role: VoiceRole;
  hostPeerId: string | null;
  roomName?: string;
  activeBook?: ActiveBook;
  reading?: ReadingState;
  peers: PeerInfo[];
  expiresAt: number;
  handRaised?: boolean;
  highlight?: { text: string } | null;
};

export type ChatMessage = { id: string; peerId: string; name: string; text: string; ts: number };
export type SessionPhase = "idle" | "joining" | "connected" | "reconnecting" | "left" | "ended" | "error";

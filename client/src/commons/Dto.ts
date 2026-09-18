export type Participant = {
    id: string;
    name: string;
};

export enum HistoryStatus {
    ROOM_FULL,
    ALREADY_JOINED,
    NONE_EXIST,
    ACCEPTED,
    LEFT,
}

export type RoomHistoryEntry =
    | {
          type: 'system';
          status: HistoryStatus;
          id: string;
          participantId: string;
          participantName: string;
          roomId: string;
          timestamp: number;
      }
    | {
          type: 'message';
          id: string;
          participantId: string;
          participantName: string;
          roomId: string;
          text: string;
          timestamp: number;
      };

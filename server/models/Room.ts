import type { Participant } from './Participant.js';

const MAX_PARTICIPANT_COUNT = 4;

export enum HistoryStatus {
    ROOM_FULL,
    ALREADY_JOINED,
    ACCEPTED,
}

export type RoomHistoryEntry = {
    status: HistoryStatus;
    id: string;
};

type JoinResult = {
    status: HistoryStatus;
    room: Room;
};

export type Room = {
    id: string;
    participants: Map<string, Participant>;
    history: RoomHistoryEntry[];
};

export function join(room: Room, newP: Participant): JoinResult {
    let history = [...room.history];
    let participants: Map<string, Participant>;
    let status: HistoryStatus;

    if (room.participants.size >= MAX_PARTICIPANT_COUNT) {
        status = HistoryStatus.ROOM_FULL;
        participants = room.participants;
    } else if (room.participants.has(newP.id)) {
        status = HistoryStatus.ALREADY_JOINED;
        participants = room.participants;
    } else {
        status = HistoryStatus.ACCEPTED;
        participants = new Map(room.participants);
        participants.set(newP.id, newP);
    }

    history.push({
        status,
        id: newP.id,
    });

    const newRoom = {
        ...room,
        participants,
        history,
    };
    return {
        status,
        room: newRoom,
    };
}

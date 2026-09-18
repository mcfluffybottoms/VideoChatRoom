import type { Participant } from './Participant';

const MAX_MESSAGE_LENGTH = 500;

export type ChatMessage = {
    type: 'message';
    id: string;
    participantId: string;
    participantName: string;
    roomId: string;
    text: string;
    timestamp: number;
};

export type SystemMessage = {
    type: 'system';
    id: string;
    participantId: string;
    participantName: string;
    roomId: string;
    status: HistoryStatus;
    timestamp: number;
};

export enum HistoryStatus {
    ROOM_FULL,
    ALREADY_JOINED,
    NONE_EXIST,
    ACCEPTED,
    LEFT,
}

export type RoomHistoryEntry = SystemMessage | ChatMessage;

export function createChatMessage(
    participantId: string,
    participantName: string,
    roomId: string,
    text: string,
): ChatMessage | null {
    if (text.length > MAX_MESSAGE_LENGTH) {
        return null;
    }
    if (!text || text.trim().length < 0) {
        return null;
    }

    return {
        type: 'message',
        id: crypto.randomUUID(),
        participantId,
        participantName,
        roomId,
        text: text,
        timestamp: Date.now(),
    };
}

export function createSystemMessage(
    participantId: string,
    participantName: string,
    roomId: string,
    status: HistoryStatus,
): SystemMessage | null {
    return {
        type: 'system',
        id: crypto.randomUUID(),
        participantId,
        participantName,
        roomId,
        status: status,
        timestamp: Date.now(),
    };
}

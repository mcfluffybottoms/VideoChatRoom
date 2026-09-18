import crypto from 'crypto';

import type { Participant } from './Participant';

import { addMessage } from '../data/message-repository';

import type { RoomHistoryEntry } from './ChatMessage';

const MAX_PARTICIPANT_COUNT = 4;

export enum HistoryStatus {
    ROOM_FULL,
    ALREADY_JOINED,
    NONE_EXIST,
    ACCEPTED,
    LEFT,
}

export type JoinResult = {
    status: HistoryStatus;
    historyEntry: RoomHistoryEntry;
};

export class Room {
    constructor(
        public id: string,
        public participants: Map<string, Participant> = new Map(),
    ) {}

    join(participant: Participant): JoinResult {
        let status: HistoryStatus;

        if (this.participants.size >= MAX_PARTICIPANT_COUNT) {
            status = HistoryStatus.ROOM_FULL;
        } else if (this.participants.has(participant.id)) {
            status = HistoryStatus.ALREADY_JOINED;
        } else {
            status = HistoryStatus.ACCEPTED;

            this.participants.set(participant.id, participant);
        }

        const historyEntry: RoomHistoryEntry = {
            type: 'system',
            status,
            id: crypto.randomUUID(),
            participantId: participant.id,
            participantName: participant.name,
            roomId: this.id,
            timestamp: Date.now(),
        };

        if (status === HistoryStatus.ACCEPTED) {
            addMessage(historyEntry);
        }

        return {
            status,
            historyEntry,
        };
    }

    leave(participantId: string): JoinResult {
        const participant = this.participants.get(participantId);

        let status: HistoryStatus;

        if (!participant) {
            status = HistoryStatus.NONE_EXIST;
        } else {
            status = HistoryStatus.LEFT;

            this.participants.delete(participantId);
        }

        const historyEntry: RoomHistoryEntry = {
            type: 'system',
            status,
            id: crypto.randomUUID(),
            participantId,
            participantName: participant?.name ?? 'Unknown user',
            roomId: this.id,
            timestamp: Date.now(),
        };

        if (status === HistoryStatus.LEFT) {
            addMessage(historyEntry);
        }

        return {
            status,
            historyEntry,
        };
    }
}

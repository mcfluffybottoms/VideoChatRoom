import type { RoomHistoryEntry } from '../models/ChatMessage';

const messages = new Map<string, RoomHistoryEntry[]>();

const messageTimestampsPerSocket = new Map<string, number>();

export function getMessages(roomId: string): RoomHistoryEntry[] {
    return messages.get(roomId) ?? [];
}

export function addMessage(message: RoomHistoryEntry): void {
    const roomMessages = messages.get(message.roomId) ?? [];

    roomMessages.push(message);

    messages.set(message.roomId, roomMessages);

    if (message.type === 'message') {
        messageTimestampsPerSocket.set(message.participantId, Date.now());
    }
}

export function deleteMessages(roomId: string): boolean {
    return messages.delete(roomId);
}

export function lastMessageTimestamp(participantId: string): number {
    return messageTimestampsPerSocket.get(participantId) ?? 0;
}

export function deleteMessageTimestamp(participantId: string): boolean {
    return messageTimestampsPerSocket.delete(participantId);
}

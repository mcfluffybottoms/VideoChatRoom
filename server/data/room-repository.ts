import type { Room } from '../models/Room.js';

const rooms = new Map<string, Room>();

export function getRoom(roomId: string): Room | undefined {
    return rooms.get(roomId);
}

export function createRoom(roomId: string): Room {
    const room: Room = {
        id: roomId,
        participants: new Map(),
        history: [],
    };

    rooms.set(roomId, room);

    return room;
}

export function getOrCreateRoom(roomId: string): Room {
    const existingRoom = rooms.get(roomId);

    if (existingRoom) {
        return existingRoom;
    }

    return createRoom(roomId);
}

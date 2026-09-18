import { Room } from '../models/Room';

const rooms = new Map<string, Room>();

export function getRoom(roomId: string): Room | undefined {
    return rooms.get(roomId);
}

export function createRoom(roomId: string): Room {
    const room: Room = new Room(roomId);
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

export function deleteRoom(roomId: string): boolean {
    return rooms.delete(roomId);
}

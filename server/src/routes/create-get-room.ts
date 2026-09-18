import { type Request, type Response } from 'express';
import { getRoom } from '../../data/room-repository';

function generateRoomId(): string {
    return crypto.randomUUID();
}

export function createRoom(request: Request, response: Response) {
    const { name } = request.body;
    const roomId = generateRoomId();
    response.status(201).json({
        roomId,
        name
    });
}

export function getRoomById(request: Request<{ roomId: string }>, response: Response) {
    const { roomId } = request.params;

    const room = getRoom(roomId);

    if (!room) {
        response.status(404).json({
            error: 'Room does not exist',
        });
        return;
    }

    response.status(200).json({
        roomId: room.id,
    });
}
import type { Server, Socket } from 'socket.io';
import { Room } from '../models/Room';
import type { Participant } from '../models/Participant';
import { deleteRoom, getOrCreateRoom, getRoom } from '../data/room-repository';
import { createChatMessage, HistoryStatus } from '../models/ChatMessage';
import {
    addMessage,
    deleteMessages,
    deleteMessageTimestamp,
    getMessages,
    lastMessageTimestamp,
} from '../data/message-repository';

const MESSAGE_WINDOW_MS = 10_000;

export function connectHandlers(io: Server) {
    io.on('connection', (socket) => {
        registerSocketHandlers(io, socket);
    });
}

export function registerSocketHandlers(io: Server, socket: Socket) {
    console.log(`Socket connected: ${socket.id}`);

    registerRoomInteractions(io, socket);
    registerMessagingInteractions(io, socket);
}

function registerRoomInteractions(io: Server, socket: Socket) {
    socket.on('room:join', ({ roomId, name }) => {
        const room = getOrCreateRoom(roomId);
        const participant = {
            id: socket.id,
            name,
        };

        const joined = joinRoom(io, socket, room, participant);
        if (joined) {
            socket.data.roomId = roomId;
        }
    });

    socket.on('room:leave', () => {
        const roomId = socket.data.roomId;
        let existingRoom = getRoom(roomId);
        if (!existingRoom) {
            return;
        }
        const left = leaveRoom(io, socket, existingRoom, socket.id);
        if (!left) {
            return;
        }
        if (existingRoom.participants.size === 0) {
            deleteRoom(roomId);
            deleteMessages(roomId);
        }
        socket.data.roomId = undefined;
    });

    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        if (!roomId) {
            return;
        }

        const room = getRoom(roomId);
        if (!room) {
            return;
        }
        const left = leaveRoomNoEmit(io, socket, room, socket.id);
        if (!left) {
            return;
        }
        if (room.participants.size === 0) {
            deleteRoom(roomId);
            deleteMessages(roomId);
        }
    });
}

function registerMessagingInteractions(io: Server, socket: Socket) {
    socket.on('room:message', ({ roomId, text }) => {
        const room = getRoom(roomId);

        if (!room) {
            return;
        }

        addMessageToRoom(io, socket, room, text);
    });
}

export function addMessageToRoom(
    io: Server,
    socket: Socket,
    room: Room,
    text: string,
): boolean {
    const participant = room.participants.get(socket.id);
    if (!participant) {
        return false;
    }

    if (Date.now() - lastMessageTimestamp(socket.id) < MESSAGE_WINDOW_MS) {
        socket.emit('room:message_rate_limited');
        return false;
    }

    const chatMessage = createChatMessage(socket.id, participant.name, room.id, text);

    if (!chatMessage) {
        return false;
    }

    addMessage(chatMessage);

    io.to(room.id).emit('room:message', chatMessage);
    return true;
}

export function joinRoom(
    io: Server,
    socket: Socket,
    room: Room,
    participant: Participant,
): boolean {
    const result = room.join(participant);
    if (result.status === HistoryStatus.ROOM_FULL) {
        socket.emit('room:full');
        return false;
    }
    if (result.status === HistoryStatus.ALREADY_JOINED) {
        socket.emit('room:already_joined');
        return false;
    }
    socket.join(room.id);

    socket.emit('room:joined', {
        selfId: socket.id,
        participants: Array.from(room.participants.values()),
        history: getMessages(room.id),
    });

    broadcastParticipants(io, room);
    return true;
}

export function leaveRoom(
    io: Server,
    socket: Socket,
    room: Room,
    participantId: string,
): boolean {
    const result = room.leave(participantId);
    if (result.status === HistoryStatus.NONE_EXIST) {
        socket.emit('room:none_exist');
        return false;
    }

    socket.leave(room.id);

    socket.emit('room:left', {
        selfId: socket.id,
        participants: Array.from(room.participants.values()),
        history: getMessages(room.id),
    });

    broadcastParticipants(io, room);
    deleteMessageTimestamp(participantId);
    return true;
}

export function leaveRoomNoEmit(
    io: Server,
    socket: Socket,
    room: Room,
    participantId: string,
): boolean {
    const result = room.leave(participantId);
    if (result.status === HistoryStatus.NONE_EXIST) {
        return false;
    }

    socket.leave(room.id);

    broadcastParticipants(io, room);
    deleteMessageTimestamp(participantId);
    return true;
}

export function broadcastParticipants(io: Server, room: Room) {
    io.to(room.id).emit('room:participants', {
        participants: Array.from(room.participants.values()),
    });
}

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
    registerSignalingInteractions(io, socket);
}

function registerRoomInteractions(io: Server, socket: Socket) {
    socket.on('room:join', ({ roomId, name }) => {
        const room = getOrCreateRoom(roomId);
        const participant: Participant & {
            videoEnabled: boolean;
            audioEnabled: boolean;
        } = {
            id: socket.id,
            name,
            videoEnabled: false,
            audioEnabled: true,
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

    const chatMessage = createChatMessage(
        socket.id,
        participant.name,
        room.id,
        text,
    );

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

    const history = getMessages(room.id);
    const joinMessage = history[history.length - 1];

    socket.join(room.id);

    socket.emit('room:joined', {
        selfId: socket.id,
        participants: Array.from(room.participants.values()),
        history,
    });

    if (joinMessage?.type === 'system') {
        socket.to(room.id).emit('room:message', joinMessage);
    }

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

    const history = getMessages(room.id);
    const leaveMessage = history[history.length - 1];

    socket.leave(room.id);

    socket.emit('room:left', {
        selfId: socket.id,
        participants: Array.from(room.participants.values()),
        history,
    });

    if (leaveMessage?.type === 'system') {
        io.to(room.id).emit('room:message', leaveMessage);
    }

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

    const history = getMessages(room.id);
    const leaveMessage = history[history.length - 1];

    socket.leave(room.id);
    if (leaveMessage?.type === 'system') {
        io.to(room.id).emit('room:message', leaveMessage);
    }

    broadcastParticipants(io, room);
    deleteMessageTimestamp(participantId);
    return true;
}

export function broadcastParticipants(io: Server, room: Room) {
    io.to(room.id).emit('room:participants', {
        participants: Array.from(room.participants.values()),
    });
}

// Relay WebRTC signaling only between members of the same in-memory room.
function registerSignalingInteractions(io: Server, socket: Socket) {
    socket.on('webrtc:offer', (payload) => {
        relayWebRTC(io, socket, 'webrtc:offer', payload);
    });

    socket.on('webrtc:answer', (payload) => {
        relayWebRTC(io, socket, 'webrtc:answer', payload);
    });

    socket.on('webrtc:ice', (payload) => {
        relayWebRTC(io, socket, 'webrtc:ice', payload);
    });

    socket.on('webrtc:media_state', (payload) => {
        shareMediaState(io, socket, payload);
    });
}

function relayWebRTC(
    io: Server,
    socket: Socket,
    event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice',
    payload: {
        to?: string;
        description?: unknown;
        candidate?: unknown;
    },
) {
    const roomId = socket.data.roomId as string | undefined;
    const room = roomId ? getRoom(roomId) : undefined;
    const targetId = payload?.to;

    if (
        !room ||
        !room.participants.has(socket.id) ||
        !targetId ||
        targetId === socket.id ||
        !room.participants.has(targetId)
    ) {
        return;
    }

    const forwarded =
        event === 'webrtc:ice'
            ? {
                  from: socket.id,
                  candidate: payload.candidate,
              }
            : {
                  from: socket.id,
                  description: payload.description,
              };

    io.to(targetId).emit(event, forwarded);
}

function shareMediaState(
    io: Server,
    socket: Socket,
    payload: {
        videoEnabled?: boolean;
        audioEnabled?: boolean;
    },
) {
    const roomId = socket.data.roomId as string | undefined;
    const room = roomId ? getRoom(roomId) : undefined;

    if (!room || !room.participants.has(socket.id)) {
        return;
    }

    const participant = room.participants.get(socket.id) as
        | (Participant & {
              videoEnabled?: boolean;
              audioEnabled?: boolean;
          })
        | undefined;

    if (!participant) {
        return;
    }

    // Persist the latest media state so users who join later receive it
    // through room:joined / room:participants.
    if (typeof payload.videoEnabled === 'boolean') {
        participant.videoEnabled = payload.videoEnabled;
    }

    if (typeof payload.audioEnabled === 'boolean') {
        participant.audioEnabled = payload.audioEnabled;
    }

    for (const participantId of room.participants.keys()) {
        if (participantId === socket.id) continue;

        io.to(participantId).emit('webrtc:media_state', {
            from: socket.id,
            videoEnabled: participant.videoEnabled ?? false,
            audioEnabled: participant.audioEnabled ?? true,
        });
    }

    // Keep the participant snapshot in sync for all clients.
    broadcastParticipants(io, room);
}

import { useEffect, useRef, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { socket } from '../../config/socket';

type Participant = {
    id: string;
    name: string;
};

enum HistoryStatus {
    ROOM_FULL,
    ALREADY_JOINED,
    NONE_EXIST,
    ACCEPTED,
    LEFT,
}

type RoomHistoryEntry =
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

const MAX_MESSAGE_LENGTH = 500;

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatHistoryStatus(status: HistoryStatus): string {
    switch (status) {
        case HistoryStatus.ACCEPTED:
            return 'joined the room';

        case HistoryStatus.LEFT:
            return 'left the room';

        case HistoryStatus.ROOM_FULL:
            return 'could not join because the room is full';

        case HistoryStatus.ALREADY_JOINED:
            return 'is already in the room';

        case HistoryStatus.NONE_EXIST:
            return 'was not in the room';
    }
}

function Room() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    const [participants, setParticipants] = useState<Participant[]>([]);
    const [messages, setMessages] = useState<RoomHistoryEntry[]>([]);
    const [text, setText] = useState('');
    const [error, setError] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!roomId) {
            navigate('/');
            return;
        }

        const handleJoined = ({
            participants,
            history,
        }: {
            participants: Participant[];
            history: RoomHistoryEntry[];
        }) => {
            setParticipants(participants);
            setMessages(history);
            setError('');
        };

        const handleParticipants = ({
            participants,
        }: {
            participants: Participant[];
        }) => {
            setParticipants(participants);
        };

        const handleMessage = (message: RoomHistoryEntry) => {
            setMessages((current) => [...current, message]);
        };

        const handleRoomFull = () => {
            setError('Room is full.');
        };

        const handleAlreadyJoined = () => {
            setError('You are already in this room.');
        };

        const handleRateLimited = () => {
            setError('You are sending messages too quickly.');
        };

        const handleRoomNotFound = () => {
            setError('Room does not exist.');
        };

        const handleConnectError = (error: Error) => {
            console.error('Socket connection error:', error);

            setError('Server is unavailable.');
        };

        const joinRoom = () => {
            console.log('JOINING ROOM:', roomId);

            socket.emit('room:join', {
                roomId,
                name: sessionStorage.getItem(`roomName:${roomId}`) ?? '',
            });
        };

        socket.on('room:joined', handleJoined);
        socket.on('room:participants', handleParticipants);
        socket.on('room:message', handleMessage);
        socket.on('room:history', handleMessage);
        socket.on('room:full', handleRoomFull);
        socket.on('room:already_joined', handleAlreadyJoined);
        socket.on('room:message_rate_limited', handleRateLimited);
        socket.on('room:none_exist', handleRoomNotFound);
        socket.on('connect_error', handleConnectError);

        if (socket.connected) {
            joinRoom();
        } else {
            socket.once('connect', joinRoom);

            socket.connect();
        }

        return () => {
            socket.off('room:joined', handleJoined);
            socket.off('room:participants', handleParticipants);
            socket.off('room:message', handleMessage);
            socket.off('room:history', handleMessage);
            socket.off('room:full', handleRoomFull);
            socket.off('room:already_joined', handleAlreadyJoined);
            socket.off('room:message_rate_limited', handleRateLimited);
            socket.off('room:none_exist', handleRoomNotFound);
            socket.off('connect_error', handleConnectError);
            socket.off('connect', joinRoom);
        };
    }, [roomId, navigate]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: 'smooth',
        });
    }, [messages]);

    useEffect(() => {
        console.log('RENDER participants:', participants);
    }, [participants]);

    function handleSubmitMessage(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        const normalizedText = text.trim();
        if (!roomId || !normalizedText) {
            return;
        }
        if (normalizedText.length > MAX_MESSAGE_LENGTH) {
            setError(
                `Message is too long. Maximum length is ${MAX_MESSAGE_LENGTH} characters.`,
            );
            return;
        }

        setError('');
        socket.emit('room:message', {
            roomId,
            text: normalizedText,
        });
        setText('');
    }

    return (
        <div>
            <h1>Room</h1>
            <p>Room ID: {roomId}</p>
            {error && <p>{error}</p>}
            <section>
                <h2>Participants</h2>
                <ul>
                    {participants.map((participant) => (
                        <li key={participant.id}>{participant.name}</li>
                    ))}
                </ul>
            </section>
            <section>
                <h2>Messages</h2>
                <div>
                    {messages.map((entry) => {
                        const participantName =
                            entry.participantName ?? 'Unknown user';

                        if (entry.type === 'system') {
                            return (
                                <div key={entry.id}>
                                    <strong>{participantName}</strong>{' '}
                                    {formatHistoryStatus(entry.status)}
                                </div>
                            );
                        }

                        return (
                            <div key={entry.id}>
                                <strong>{participantName}</strong>

                                <span> {formatTime(entry.timestamp)}</span>

                                <p>{entry.text}</p>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            </section>

            <form onSubmit={handleSubmitMessage}>
                <input
                    value={text}
                    maxLength={MAX_MESSAGE_LENGTH}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Message..."
                />

                <button type="submit">Send</button>
            </form>
        </div>
    );
}

export default Room;

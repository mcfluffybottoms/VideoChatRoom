import { useEffect, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';
import './Room.css';
import { socket } from '../../config/socket';
import VideoGrid from './VideoGrid';
import { Participant, RoomHistoryEntry } from '../../commons/dto';
import MessageList from './MessageList';
import { isWebRTCSupported } from '../../commons/webrtc';

const MAX_MESSAGE_LENGTH = 500;

function Room() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    const [participants, setParticipants] = useState<Participant[]>([]);
    const [messages, setMessages] = useState<RoomHistoryEntry[]>([]);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [selfId, setSelfId] = useState('');

    // copy url
    const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>(
        'idle',
    );

    async function handleCopyRoomUrl() {
        if (!navigator.clipboard) {
            setCopyStatus('error');
            return;
        }

        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopyStatus('success');
        } catch {
            setCopyStatus('error');
        }

        setTimeout(() => {
            setCopyStatus('idle');
        }, 2000);
    }

    type RoomError = 'full' | 'server' | null;
    const [roomError, setRoomError] = useState<RoomError>(null);

    useEffect(() => {
        if (!roomId) {
            navigate('/');
            return;
        }

        const handleJoined = ({
            selfId,
            participants,
            history,
        }: {
            selfId: string;
            participants: Participant[];
            history: RoomHistoryEntry[];
        }) => {
            setSelfId(selfId);
            setParticipants(participants);
            setMessages(history);
            setError('');
            setRoomError(null);
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
            setRoomError('full');
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
            setRoomError('server');
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

    if (roomError === 'full') {
        return (
            <div>
                <h1>Комната заполнена</h1>
                <p>В комнате больше нет свободных мест.</p>
                <button onClick={() => navigate('/')}>
                    Вернуться на главную
                </button>
                <button onClick={() => window.location.reload()}>
                    Попробовать еще раз
                </button>
            </div>
        );
    }

    if (roomError === 'server') {
        return (
            <div>
                <h1>Ошибка сервера</h1>
                <p>Не удалось подключиться к серверу.</p>
                <button onClick={() => window.location.reload()}>
                    Повторить
                </button>
            </div>
        );
    }

    // check webrtc compability
    const isSupported = isWebRTCSupported();

    return (
        <div>
            <h1>Room</h1>
            <p>Room ID: {roomId}</p>
            <button type="button" onClick={handleCopyRoomUrl}>
                Скопировать ссылку
            </button>

            {copyStatus !== 'idle' && (
                <div
                    className={`copy-banner copy-banner-${copyStatus}`}
                    role="status"
                >
                    {copyStatus === 'success'
                        ? 'Ссылка скопирована в буфер обмена.'
                        : 'Не удалось скопировать ссылку. Проверьте разрешение на доступ к буферу обмена.'}
                </div>
            )}

            {error && <p>{error}</p>}
            {!isSupported && (
                <div className="room-error" role="alert">
                    Ваш браузер не поддерживает WebRTC. Используйте современный
                    браузер.
                </div>
            )}

            <div className="room-content">
                <section className="room-video">
                    <VideoGrid participants={participants} selfId={selfId} />
                </section>

                <section className="room-chat">
                    <MessageList messages={messages} />
                    <form onSubmit={handleSubmitMessage}>
                        <input
                            value={text}
                            maxLength={MAX_MESSAGE_LENGTH}
                            onChange={(event) => setText(event.target.value)}
                            placeholder="Message..."
                        />

                        <button type="submit">Send</button>
                    </form>
                </section>
            </div>
        </div>
    );
}

export default Room;

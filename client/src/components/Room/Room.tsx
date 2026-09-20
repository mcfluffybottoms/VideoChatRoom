import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './Room.css';
import { socket } from '../../config/socket';
import VideoGrid from './VideoGrid';
import {
    NotificationStatus,
    Participant,
    RoomHistoryEntry,
} from '../../commons/dto';
import MessageList from './MessageList';
import { isWebRTCSupported } from '../../commons/webrtc';
import { useMediaDevices } from '../../hooks/useMediaDevices';
import { useRoomWebRTC } from '../../hooks/useRoomWebRTC';

const MAX_MESSAGE_LENGTH = 500;

type RoomProps = {
    name: string;
};

type RoomError = 'full' | 'server' | null;

function Room({ name }: RoomProps) {
    const { roomId } = useParams();
    const navigate = useNavigate();

    /*
     * notification state.
     */
    const [notification, setnotification] = useState<NotificationStatus | null>(
        null,
    );
    const [notificationKey, setNotificationKey] = useState(0);
    function showError(v: NotificationStatus | null) {
        setnotification(v);
        setNotificationKey((current) => current + 1);
    }

    /*
     * Copy room URL.
     */
    async function handleCopyRoomUrl() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            showError({
                type: 'success',
                message: 'Ссылка скопирована в буфер обмена!',
            });
        } catch {
            showError({
                type: 'error',
                message: 'Не удалось скопировать ссылку!',
            });
        }
    }

    /*
     * Room state.
     */
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [messages, setMessages] = useState<RoomHistoryEntry[]>([]);
    const [text, setText] = useState('');
    const [selfId, setSelfId] = useState('');
    const [roomError, setRoomError] = useState<RoomError>(null);

    /*
     * Socket / room lifecycle.
     */
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
            showError({ type: 'error', message: 'Вы уже в комнате.' });
        };

        const handleRateLimited = () => {
            showError({
                type: 'error',
                message: 'Подождите, прежде чем слать новое сообщение.',
            });
        };

        const handleRoomNotFound = () => {
            showError({ type: 'error', message: 'Такой комнаты нет.' });
        };

        const handleConnectError = (error: Error) => {
            console.error('Socket connection error:', error);

            setRoomError('server');
        };

        const joinRoom = () => {
            socket.emit('room:join', {
                roomId,
                name: name ?? '',
            });
        };

        const offSocketEvents = () => {
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
        }

        offSocketEvents();

        socket.on('room:joined', handleJoined);
        socket.on('room:participants', handleParticipants);
        socket.on('room:message', handleMessage);
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

        return offSocketEvents;
    }, [roomId, navigate, name]);

    /*
     * Chat.
     */
    function handleSubmitMessage(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        const normalizedText = text.trim();

        if (!roomId || !normalizedText) {
            return;
        }

        if (normalizedText.length > MAX_MESSAGE_LENGTH) {
            showError({
                type: 'error',
                message: `Сообщение слишком длинное. Максимум возможно ${MAX_MESSAGE_LENGTH} символов.`,
            });

            return;
        }

        socket.emit('room:message', {
            roomId,
            text: normalizedText,
        });

        setText('');
    }

    /*
     * Leave room.
     */
    function handleLeaveRoom() {
        socket.emit('room:leave');
        socket.disconnect();

        navigate('/');
    }

    /*
     * Local media.
     */
    const {
        stream,
        isMicrophoneEnabled,
        isCameraEnabled,
        toggleMicrophone,
        enableCamera,
        disableCamera,
        error: mediaError,
        errorKey: mediaErrorKey,
        isCameraAvailable,
        isMicrophoneAvailable,
    } = useMediaDevices();

    /*
     * WebRTC is now isolated from the room UI.
     */
    const isSupported = isWebRTCSupported();

    const { remoteStreams, peerStates, audioUnlocked, enableRemoteAudio } =
        useRoomWebRTC({
            participants,
            selfId,
            stream,
        });

    /*
     * Persistent errors.
     */
    let isWebRTCSupportedNotification: NotificationStatus | null = null;
    if (!isSupported) {
        isWebRTCSupportedNotification = {
            type: 'error',
            message: 'WebRTC недоступен в этом браузере.',
        };
    }

    /*
     * Room-level error pages.
     */
    if (roomError === 'full') {
        return (
            <div>
                <h1>Комната заполнена</h1>

                <p>В комнате больше нет свободных мест.</p>

                <button type="button" onClick={() => navigate('/')}>
                    Вернуться на главную
                </button>

                <button type="button" onClick={() => window.location.reload()}>
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

                <button type="button" onClick={() => window.location.reload()}>
                    Повторить
                </button>
            </div>
        );
    }

    /*
     * Final room UI.
     */
    return (
        <div>
            <div className="room-header">
                <h1>Room</h1>

                <p>Room ID: {roomId}</p>

                <button type="button" onClick={handleCopyRoomUrl}>
                    Скопировать ссылку
                </button>
                {!audioUnlocked && (
                    <button
                        type="button"
                        className="media-button"
                        onClick={enableRemoteAudio}
                    >
                        🔊 Разрешить звук участников
                    </button>
                )}

                {notification && (
                    <div
                        key={notificationKey}
                        className={`notification notification-${notification.type}`}
                        role={
                            notification.type === 'error' ? 'alert' : 'status'
                        }
                    >
                        {notification.message}
                    </div>
                )}

                {mediaError && (
                    <div
                        key={mediaErrorKey}
                        className={`persistent-notification persistent-notification-${mediaError.type}`}
                        role="alert"
                    >
                        {mediaError.message}
                    </div>
                )}

                {isWebRTCSupportedNotification && (
                    <div
                        className={`persistent-notification persistent-notification-${isWebRTCSupportedNotification.type}`}
                        role="alert"
                    >
                        {isWebRTCSupportedNotification.message}
                    </div>
                )}

                {!isSupported && (
                    <div className="room-error" role="alert">
                        Ваш браузер не поддерживает WebRTC. Используйте
                        современный браузер.
                    </div>
                )}
            </div>

            <div className="room-content">
                {/* ================================================== */}
                {/* VIDEO                                               */}
                {/* ================================================== */}

                <section className="room-video">
                    {selfId && (
                        <VideoGrid
                            participants={participants}
                            selfId={selfId}
                            localStream={stream}
                            remoteStreams={remoteStreams}
                            peerStates={peerStates}
                            microphoneEnabled={isMicrophoneEnabled}
                            audioUnlocked={audioUnlocked}
                            cameraEnabled={isCameraEnabled}
                        />
                    )}
                </section>

                {/* ================================================== */}
                {/* CHAT                                                */}
                {/* ================================================== */}

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

            {/* ====================================================== */}
            {/* CONTROLS                                                */}
            {/* ====================================================== */}

            <div className="room-footer">
                <button
                    type="button"
                    className={`media-button ${
                        !isMicrophoneAvailable ? 'button-disabled-look' : ''
                    }`}
                    onClick={toggleMicrophone}
                >
                    {isMicrophoneEnabled ? '🎤' : '🔇'}
                </button>

                <button
                    type="button"
                    className={`media-button ${
                        !isCameraAvailable ? 'button-disabled-look' : ''
                    }`}
                    onClick={isCameraEnabled ? disableCamera : enableCamera}
                >
                    {isCameraEnabled ? '📷' : '🚫'}
                </button>

                <button
                    type="button"
                    className="media-button"
                    onClick={handleLeaveRoom}
                >
                    🚪
                </button>
            </div>
        </div>
    );
}

export default Room;

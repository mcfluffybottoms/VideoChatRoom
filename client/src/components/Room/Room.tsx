import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './Room.css';
import { socket } from '../../config/socket';
import VideoGrid from './VideoGrid';
import { Participant, RoomHistoryEntry } from '../../commons/dto';
import MessageList from './MessageList';
import { isWebRTCSupported } from '../../commons/webrtc';
import { useMediaDevices } from '../../hooks/useMediaDevices';
import { useRoomWebRTC } from '../../hooks/useRoomWebRTC';

const MAX_MESSAGE_LENGTH = 500;

type RoomProps = {
    name: string;
};

type BannerStatus = {
    type: 'success' | 'error';
    message: string;
};

type RoomError = 'full' | 'server' | null;

function Room({ name }: RoomProps) {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [banner, setBanner] = useState<BannerStatus | null>(null);
    const [bannerKey, setBannerKey] = useState(0);

    function showBanner(type: 'success' | 'error', message: string) {
        setBanner({ type, message });
        setBannerKey((current) => current + 1);
    }

    const [participants, setParticipants] = useState<Participant[]>([]);
    const [messages, setMessages] = useState<RoomHistoryEntry[]>([]);
    const [text, setText] = useState('');
    const [selfId, setSelfId] = useState('');
    const [roomError, setRoomError] = useState<RoomError>(null);

    async function handleCopyRoomUrl() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            showBanner('success', 'Ссылка скопирована в буфер обмена!');
        } catch {
            showBanner('error', 'Не удалось скопировать ссылку!');
        }
    }

    useEffect(() => {
        if (!roomId) {
            navigate('/');
            return;
        }

        const handleJoined = ({
            selfId: joinedSelfId,
            participants: joinedParticipants,
            history,
        }: {
            selfId: string;
            participants: Participant[];
            history: RoomHistoryEntry[];
        }) => {
            console.log('[Room] Joined:', joinedSelfId);
            setSelfId(joinedSelfId);
            setParticipants(joinedParticipants);
            setMessages(history);
            setRoomError(null);
        };

        const handleParticipants = ({
            participants: nextParticipants,
        }: {
            participants: Participant[];
        }) => {
            console.log('[Room] Participants:', nextParticipants);
            setParticipants(nextParticipants);
        };

        const handleMessage = (message: RoomHistoryEntry) => {
            setMessages((current) => [...current, message]);
        };

        const handleRoomFull = () => setRoomError('full');
        const handleAlreadyJoined = () =>
            showBanner('error', 'Вы уже в комнате.');
        const handleRateLimited = () =>
            showBanner('error', 'Подождите, прежде чем слать новое сообщение.');
        const handleRoomNotFound = () => showBanner('error', 'Такой комнаты нет.');
        const handleConnectError = (error: Error) => {
            console.error('Socket connection error:', error);
            setRoomError('server');
        };

        const joinRoom = () => {
            console.log('[Room] Joining room:', roomId);
            socket.emit('room:join', { roomId, name: name ?? '' });
        };

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

        return () => {
            socket.off('room:joined', handleJoined);
            socket.off('room:participants', handleParticipants);
            socket.off('room:message', handleMessage);
            socket.off('room:full', handleRoomFull);
            socket.off('room:already_joined', handleAlreadyJoined);
            socket.off('room:message_rate_limited', handleRateLimited);
            socket.off('room:none_exist', handleRoomNotFound);
            socket.off('connect_error', handleConnectError);
            socket.off('connect', joinRoom);
        };
    }, [roomId, navigate, name]);

    function handleSubmitMessage(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const normalizedText = text.trim();

        if (!roomId || !normalizedText) {
            return;
        }

        if (normalizedText.length > MAX_MESSAGE_LENGTH) {
            showBanner(
                'error',
                `Сообщение слишком длинное. Максимум возможно ${MAX_MESSAGE_LENGTH} символов.`,
            );
            return;
        }

        socket.emit('room:message', { roomId, text: normalizedText });
        setText('');
    }

    const {
        stream,
        isMicrophoneEnabled,
        isCameraEnabled,
        toggleMicrophone,
        enableCamera,
        disableCamera,
        error: mediaError,
        isCameraAvailable,
        isMicrophoneAvailable,
    } = useMediaDevices();

    const isSupported = isWebRTCSupported();

    const {
        remoteStreams,
        peerStates,
        audioUnlocked,
        audioNeedsGesture,
        enableRemoteAudio,
        registerVideoElement,
    } = useRoomWebRTC({
        selfId,
        participants,
        stream,
        isSupported,
    });

    useEffect(() => {
        if (!banner) {
            return;
        }

        const timer = window.setTimeout(() => {
            setBanner(null);
        }, 2000);

        return () => {
            window.clearTimeout(timer);
        };
    }, [banner]);

    function handleLeaveRoom() {
        socket.emit('room:leave');
        socket.disconnect();
        navigate('/');
    }

    const persistentBanner: BannerStatus | null = !isSupported
        ? { type: 'error', message: 'WebRTC недоступен в этом браузере.' }
        : mediaError
          ? { type: 'error', message: mediaError }
          : null;

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

    return (
        <div>
            <div className="room-header">
                <h1>Room</h1>
                <p>Room ID: {roomId}</p>

                <button type="button" onClick={handleCopyRoomUrl}>
                    Скопировать ссылку
                </button>

                {/* The button that actually unlocks remote audio. */}
                <button
                    type="button"
                    onClick={() => void enableRemoteAudio()}
                    disabled={audioUnlocked && !audioNeedsGesture}
                >
                    {audioUnlocked
                        ? audioNeedsGesture
                            ? 'Повторить включение звука'
                            : 'Звук включён'
                        : 'Разрешить звук участников'}
                </button>

                {banner && (
                    <div
                        key={bannerKey}
                        className={`banner banner-${banner.type}`}
                        role={banner.type === 'error' ? 'alert' : 'status'}
                    >
                        {banner.message}
                    </div>
                )}

                {persistentBanner && (
                    <div
                        className={`persistent-banner persistent-banner-${persistentBanner.type}`}
                        role="alert"
                    >
                        {persistentBanner.message}
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
                <section className="room-video">
                    <VideoGrid
                        participants={participants}
                        selfId={selfId}
                        localStream={stream}
                        remoteStreams={remoteStreams}
                        peerStates={peerStates}
                        microphoneEnabled={isMicrophoneEnabled}
                        audioUnlocked={audioUnlocked}
                        cameraEnabled={isCameraEnabled}
                        registerVideoElement={registerVideoElement}
                    />

                    {audioNeedsGesture && (
                        <p role="status">
                            Браузер заблокировал автовоспроизведение. Нажмите
                            «Разрешить звук участников» выше.
                        </p>
                    )}
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
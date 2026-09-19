import { useEffect, useRef, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';
import './Room.css';
import { socket } from '../../config/socket';
import VideoGrid from './VideoGrid';
import { Participant, RoomHistoryEntry } from '../../commons/dto';
import MessageList from './MessageList';
import { isWebRTCSupported } from '../../commons/webrtc';
import { useMediaDevices } from '../../hooks/useMediaDevices';
import { RTC_CONFIGURATION } from '../../commons/webrtc';

const MAX_MESSAGE_LENGTH = 500;

type RoomProps = {
    name: string;
};

function Room({ name }: RoomProps) {
    const { roomId } = useParams();
    const navigate = useNavigate();

    // banner for errors
    type BannerStatus = {
        type: 'success' | 'error';
        message: string;
    };
    const [banner, setBanner] = useState<BannerStatus | null>(null);
    const [bannerKey, setBannerKey] = useState(0);
    let persistentBanner: BannerStatus | null = null;

    function showBanner(type: 'success' | 'error', message: string) {
        setBanner({
            type,
            message,
        });

        setBannerKey((current) => current + 1);
    }

    // copy url
    async function handleCopyRoomUrl() {
        try {
            await navigator.clipboard.writeText(window.location.href);

            showBanner('success', 'Ссылка скопирована в буфер обмена!');
        } catch {
            showBanner('error', 'Не удалось скопировать ссылку!');
        }
    }

    // user relationships
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [messages, setMessages] = useState<RoomHistoryEntry[]>([]);
    const [text, setText] = useState('');
    const [selfId, setSelfId] = useState('');
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
            setRoomError(null);
        };

        const offSockets = () => {
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
            showBanner('error', 'Вы уже в комнате.');
        };

        const handleRateLimited = () => {
            showBanner('error', 'Подождите, прежде чем слать новое сообщение.');
        };

        const handleRoomNotFound = () => {
            showBanner('error', 'Такой комнаты нет.');
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

        offSockets();
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

        return offSockets;
    }, [roomId, navigate, name]);

    function handleSubmitMessage(event: React.SubmitEvent<HTMLFormElement>) {
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

        socket.emit('room:message', {
            roomId,
            text: normalizedText,
        });
        setText('');
    }

    function handleLeaveRoom() {
        socket.emit('room:leave');

        socket.disconnect();
        //sessionStorage.removeItem(`roomName:${roomId}`)
        navigate('/');
    }

    /* 
        media
    */
    const {
        stream,
        isMicrophoneEnabled,
        isCameraEnabled,
        toggleMicrophone,
        enableCamera,
        disableCamera,
        error: mediaError,
    } = useMediaDevices();
    const isSupported = isWebRTCSupported();
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const [remoteStreams, setRemoteStreams] = useState<
        Record<string, MediaStream>
    >({});
    const [peerStates, setPeerStates] = useState<Record<string, string>>({});
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);

    // Keep each participant's connection stable; the lexicographically smaller
    // socket id creates the offer, preventing simultaneous offers/glare.
    useEffect(() => {
        if (!selfId || !isSupported) return;
        const activeIds = new Set(
            participants.map((p) => p.id).filter((id) => id !== selfId),
        );
        for (const [id, pc] of peerConnections.current) {
            if (!activeIds.has(id)) {
                pc.close();
                peerConnections.current.delete(id);
                setRemoteStreams((current) => {
                    const next = { ...current };
                    delete next[id];
                    return next;
                });
                setPeerStates((current) => {
                    const next = { ...current };
                    delete next[id];
                    return next;
                });
            }
        }
        for (const participant of participants) {
            if (
                participant.id === selfId ||
                peerConnections.current.has(participant.id)
            ) {
                continue;
            }
            const peerId = participant.id;
            const pc = new RTCPeerConnection(RTC_CONFIGURATION);
            peerConnections.current.set(peerId, pc);
            stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
            pc.ontrack = (event) => {
                const incoming =
                    event.streams[0] ?? new MediaStream([event.track]);
                setRemoteStreams((current) => ({
                    ...current,
                    [peerId]: incoming,
                }));
            };
            pc.onicecandidate = (event) => {
                if (event.candidate)
                    socket.emit('webrtc:ice', {
                        to: peerId,
                        candidate: event.candidate,
                    });
            };
            pc.onconnectionstatechange = () => {
                setPeerStates((current) => ({
                    ...current,
                    [peerId]: pc.connectionState,
                }));
                if (pc.connectionState === 'failed') {
                    // Restart ICE on the initiating side; signaling remains peer-to-peer via server relay.
                    if (selfId.localeCompare(peerId) < 0) {
                        void pc.restartIce();
                        void pc
                            .createOffer({ iceRestart: true })
                            .then((offer) =>
                                pc.setLocalDescription(offer).then(() => {
                                    socket.emit('webrtc:offer', {
                                        to: peerId,
                                        description: pc.localDescription,
                                    });
                                }),
                            )
                            .catch((error) =>
                                console.error('ICE restart failed', error),
                            );
                    }
                }
            };
            if (selfId.localeCompare(peerId) < 0) {
                void pc
                    .createOffer()
                    .then((offer) =>
                        pc.setLocalDescription(offer).then(() => {
                            socket.emit('webrtc:offer', {
                                to: peerId,
                                description: pc.localDescription,
                            });
                        }),
                    )
                    .catch((error) =>
                        console.error('WebRTC offer failed', error),
                    );
            }
        }
    }, [participants, selfId, stream, isSupported]);

    // Add/replace local tracks on existing peer connections when devices change.
    useEffect(() => {
        for (const pc of peerConnections.current.values()) {
            const senders = pc.getSenders();
            for (const track of stream?.getTracks() ?? []) {
                const sender = senders.find(
                    (item) => item.track?.kind === track.kind,
                );
                if (sender)
                    void sender
                        .replaceTrack(track)
                        .catch((error) =>
                            console.error('replaceTrack failed', error),
                        );
                else pc.addTrack(track, stream!);
            }
        }
    }, [stream]);

    // Handle incoming WebRTC signaling messages from the server relay.
    useEffect(() => {
        const onOffer = async ({
            from,
            description,
        }: {
            from: string;
            description: RTCSessionDescriptionInit;
        }) => {
            const pc = peerConnections.current.get(from);
            if (!pc || !description) return;
            try {
                await pc.setRemoteDescription(description);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('webrtc:answer', {
                    to: from,
                    description: pc.localDescription,
                });
            } catch (error) {
                console.error('WebRTC offer handling failed', error);
            }
        };
        const onAnswer = async ({
            from,
            description,
        }: {
            from: string;
            description: RTCSessionDescriptionInit;
        }) => {
            const pc = peerConnections.current.get(from);
            if (!pc || !description) return;
            try {
                await pc.setRemoteDescription(description);
            } catch (error) {
                console.error('WebRTC answer handling failed', error);
            }
        };
        const onIce = async ({
            from,
            candidate,
        }: {
            from: string;
            candidate: RTCIceCandidateInit;
        }) => {
            const pc = peerConnections.current.get(from);
            if (!pc || !candidate) return;
            try {
                await pc.addIceCandidate(candidate);
            } catch (error) {
                console.error('ICE candidate rejected', error);
            }
        };
        socket.on('webrtc:offer', onOffer);
        socket.on('webrtc:answer', onAnswer);
        socket.on('webrtc:ice', onIce);
        return () => {
            socket.off('webrtc:offer', onOffer);
            socket.off('webrtc:answer', onAnswer);
            socket.off('webrtc:ice', onIce);
        };
    }, []);

    // clear peer connections on unmount
    useEffect(
        () => () => {
            peerConnections.current.forEach((pc) => pc.close());
            peerConnections.current.clear();
        },
        [],
    );

    // 
    async function enableRemoteAudio() {
        setAudioUnlocked(true);
        let blocked = false;
        for (const video of Array.from(
            document.querySelectorAll<HTMLVideoElement>('.video-tile video'),
        )) {
            if (video.dataset.self === 'true') continue;
            video.muted = false;
            try {
                await video.play();
            } catch {
                blocked = true;
            }
        }
        setAudioNeedsGesture(blocked);
        
    }

    /* 
        error handling 
    */
    if (!isSupported) {
        persistentBanner = {
            type: 'error',
            message: 'WebRTC недоступен в этом браузере.',
        };
    } else if (mediaError) {
        persistentBanner = {
            type: 'error',
            message: mediaError,
        };
    }
    useEffect(() => {
        if (!banner) {
            return;
        }
        const timer = setTimeout(() => {
            setBanner(null);
        }, 2000);

        return () => {
            clearTimeout(timer);
        };
    }, [banner]);

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

    /* 
        final page
    */
    return (
        <div>
            <div className="room-header">
                <h1>Room</h1>
                <p>Room ID: {roomId}</p>
                <button type="button" onClick={handleCopyRoomUrl}>
                    Скопировать ссылку
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
                        key={`${persistentBanner.type}-${persistentBanner.message}`}
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
                    />
                    {Object.values(remoteStreams).length > 0 && (
                        <button
                            type="button"
                            onClick={() => void enableRemoteAudio()}
                        >
                            {audioUnlocked
                                ? 'Включить звук участников'
                                : 'Разрешить звук участников'}
                        </button>
                    )}
                    {audioNeedsGesture && (
                        <p role="status">
                            Нажмите кнопку, чтобы разрешить воспроизведение
                            звука.
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
                <button type="button" onClick={toggleMicrophone}>
                    {isMicrophoneEnabled
                        ? 'Выключить микрофон'
                        : 'Включить микрофон'}
                </button>

                <button
                    type="button"
                    onClick={isCameraEnabled ? disableCamera : enableCamera}
                >
                    {isCameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
                </button>

                <button type="button" onClick={handleLeaveRoom}>
                    {'Выйти'}
                </button>
            </div>
        </div>
    );
}

export default Room;

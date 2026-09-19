import { useCallback, useEffect, useRef, useState } from 'react';

import { socket } from '../config/socket';
import { Participant } from '../commons/dto';
import { isWebRTCSupported, RTC_CONFIGURATION } from '../commons/webrtc';

type UseWebRTCParams = {
    participants: Participant[];
    selfId: string;
    stream: MediaStream | null;
};

type UseWebRTCReturn = {
    remoteStreams: Record<string, MediaStream>;
    peerStates: Record<string, string>;
    audioUnlocked: boolean;
    audioNeedsGesture: boolean;
    enableRemoteAudio: () => Promise<void>;
};

const CONNECTION_TIMEOUT_MS = 10_000;
const ICE_RESTART_COOLDOWN_MS = 10_000;

export function useRoomWebRTC({
    participants,
    selfId,
    stream,
}: UseWebRTCParams): UseWebRTCReturn {
    const isSupported = isWebRTCSupported();

    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const makingOffer = useRef<Set<string>>(new Set());
    const renegotiating = useRef<Set<string>>(new Set());
    const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(
        new Map(),
    );
    const connectionTimeouts = useRef<
        Map<string, ReturnType<typeof setTimeout>>
    >(new Map());
    const lastIceRestart = useRef<Map<string, number>>(new Map());

    /*
     * Всегда актуальный stream без пересоздания peer connections.
     * Реконсиляция треков читает его отсюда.
     */
    const streamRef = useRef<MediaStream | null>(stream);
    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    const [remoteStreams, setRemoteStreams] = useState<
        Record<string, MediaStream>
    >({});

    const [peerStates, setPeerStates] = useState<Record<string, string>>({});

    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);

    /*
     * Таймаут «Подключение…».
     */
    const clearConnectionTimeout = useCallback((peerId: string) => {
        const t = connectionTimeouts.current.get(peerId);
        if (t !== undefined) {
            clearTimeout(t);
            connectionTimeouts.current.delete(peerId);
        }
    }, []);

    const startConnectionTimeout = useCallback(
        (peerId: string) => {
            clearConnectionTimeout(peerId);

            const t = setTimeout(() => {
                connectionTimeouts.current.delete(peerId);

                setPeerStates((current) => {
                    const state = current[peerId];

                    if (state === 'connected' || state === 'failed') {
                        return current;
                    }

                    return { ...current, [peerId]: 'failed' };
                });
            }, CONNECTION_TIMEOUT_MS);

            connectionTimeouts.current.set(peerId, t);
        },
        [clearConnectionTimeout],
    );

    /*
     * Создание и настройка одного независимого RTCPeerConnection
     * на каждого участника.
     *
     * Ключевое отличие от предыдущей версии:
     *
     * Трансиверы для audio и video создаются ЯВНО и СРАЗУ.
     * Это гарантирует, что SDP всегда содержит обе m-line,
     * даже если у локального пользователя нет камеры или микрофона.
     *
     * Без этого пользователь без видеоустройства отправлял бы
     * offer только с audio m-line, и удалённый пир не смог бы
     * отправить ему видео — некуда было бы вставлять трек.
     *
     * Локальные треки привязываются через replaceTrack, а не addTrack.
     *
     * Зависимости — только participants, selfId, isSupported.
     * stream читается через streamRef, чтобы смена локального потока
     * не пересоздавала peer connections.
     */
    useEffect(() => {
        if (!selfId || !isSupported) {
            return;
        }

        const activeIds = new Set(
            participants
                .map((participant) => participant.id)
                .filter((id) => id !== selfId),
        );

        /*
         * Удаляем соединения ушедших участников.
         */
        for (const [peerId, pc] of peerConnections.current) {
            if (activeIds.has(peerId)) {
                continue;
            }

            pc.close();
            clearConnectionTimeout(peerId);

            peerConnections.current.delete(peerId);
            makingOffer.current.delete(peerId);
            renegotiating.current.delete(peerId);
            pendingIceCandidates.current.delete(peerId);
            lastIceRestart.current.delete(peerId);

            setRemoteStreams((current) => {
                const next = { ...current };
                delete next[peerId];
                return next;
            });

            setPeerStates((current) => {
                const next = { ...current };
                delete next[peerId];
                return next;
            });
        }

        /*
         * Создаём соединения для новых участников.
         */
        for (const participant of participants) {
            const peerId = participant.id;

            if (peerId === selfId || peerConnections.current.has(peerId)) {
                continue;
            }

            const pc = new RTCPeerConnection(RTC_CONFIGURATION);
            peerConnections.current.set(peerId, pc);

            startConnectionTimeout(peerId);

            /*
             * =========================================================
             * ЯВНЫЕ ТРАНСИВЕРЫ
             * =========================================================
             *
             * Создаём обе медиа-линии заранее, независимо от того,
             * есть ли у нас локальные треки.
             *
             * direction: 'sendrecv' — мы и отправляем, и принимаем.
             * Это позволяет:
             * - принимать видео от удалённого пира, даже если у нас
             *   нет своей камеры;
             * - позже привязать локальный трек через replaceTrack,
             *   не пересоздавая соединение.
             *
             * Если у пользователя гарантированно нет камеры и она
             * никогда не появится, можно поставить 'recvonly'.
             * Но 'sendrecv' безопаснее: он не мешает и оставляет
             * возможность включить камеру позже.
             */
            const audioTransceiver = pc.addTransceiver('audio', {
                direction: 'sendrecv',
            });

            const videoTransceiver = pc.addTransceiver('video', {
                direction: 'sendrecv',
            });

            /*
             * Привязываем текущие локальные треки, если они есть.
             * replaceTrack(null) не удаляет m-line и не запускает
             * renegotiation — просто говорит «по этой линии сейчас
             * ничего не отправляем».
             */
            const currentStream = streamRef.current;
            const localAudioTrack = currentStream?.getAudioTracks()[0] ?? null;
            const localVideoTrack = currentStream?.getVideoTracks()[0] ?? null;

            void (async () => {
                try {
                    await audioTransceiver.sender.replaceTrack(localAudioTrack);
                    await videoTransceiver.sender.replaceTrack(localVideoTrack);
                } catch (error) {
                    console.error(
                        'Initial track binding failed',
                        peerId,
                        error,
                    );
                }
            })();

            /*
             * Входящие треки.
             *
             * Собираем свежий MediaStream из живых треков, чтобы
             * после замены камеры/трека <video> не остался привязан
             * к мёртвому треку.
             */
            pc.ontrack = (event) => {
                setRemoteStreams((current) => {
                    const next = new MediaStream();
                    const seen = new Set<string>();

                    const addLiveTrack = (track: MediaStreamTrack) => {
                        if (track.readyState !== 'live' || seen.has(track.id)) {
                            return;
                        }
                        seen.add(track.id);
                        next.addTrack(track);
                    };

                    current[peerId]?.getTracks().forEach(addLiveTrack);
                    event.streams.forEach((remoteStream) => {
                        remoteStream.getTracks().forEach(addLiveTrack);
                    });
                    addLiveTrack(event.track);

                    return { ...current, [peerId]: next };
                });
            };

            pc.onicecandidate = (event) => {
                if (!event.candidate) {
                    return;
                }

                socket.emit('webrtc:ice', {
                    to: peerId,
                    candidate: event.candidate,
                });
            };

            /*
             * Состояние соединения.
             *
             * Здесь же:
             * - таймаут «Подключение…»;
             * - ICE restart с кулдауном.
             *
             * Кулдаун обязателен: без TURN на строгом NAT PC будет
             * падать в failed снова и снова, и без ограничения это
             * превратится в лавину рестартов и signaling-шторм.
             */
            pc.onconnectionstatechange = () => {
                const state = pc.connectionState;
                setPeerStates((current) => ({ ...current, [peerId]: state }));

                if (state === 'connected') {
                    clearConnectionTimeout(peerId);
                    lastIceRestart.current.delete(peerId);
                    return;
                }

                if (state === 'failed') {
                    clearConnectionTimeout(peerId);

                    /*
                     * ICE restart — только для реального failed
                     * от браузера, не для нашего UI-таймаута.
                     */
                    if (
                        pc.signalingState !== 'stable' ||
                        makingOffer.current.has(peerId)
                    ) {
                        return;
                    }

                    const last = lastIceRestart.current.get(peerId) ?? 0;
                    const now = Date.now();

                    if (now - last < ICE_RESTART_COOLDOWN_MS) {
                        return;
                    }

                    lastIceRestart.current.set(peerId, now);

                    void (async () => {
                        try {
                            makingOffer.current.add(peerId);

                            pc.restartIce();

                            const offer = await pc.createOffer({
                                iceRestart: true,
                            });

                            await pc.setLocalDescription(offer);

                            if (pc.localDescription) {
                                socket.emit('webrtc:offer', {
                                    to: peerId,
                                    description: pc.localDescription,
                                });
                            }
                        } catch (error) {
                            console.error('ICE restart failed', error);
                        } finally {
                            makingOffer.current.delete(peerId);
                        }
                    })();

                    return;
                }

                startConnectionTimeout(peerId);
            };

            pc.onnegotiationneeded = async () => {
                console.log(
                    '[neg needed]',
                    'peerId:', peerId,
                    'selfId:', selfId,
                    'cmp:', selfId.localeCompare(peerId),
                    'signaling:', pc.signalingState,
                    'remoteDesc:', !!pc.currentRemoteDescription,
                    'localDesc:', !!pc.localDescription,
                );
                if (
                    pc.signalingState !== 'stable' ||
                    makingOffer.current.has(peerId)
                ) {
                    return;
                }

                const isInitial =
                    !pc.currentRemoteDescription && !pc.localDescription;

                if (isInitial && selfId.localeCompare(peerId) >= 0) {
                    return;
                }

                try {
                    makingOffer.current.add(peerId);

                    const offer = await pc.createOffer();

                    if (pc.signalingState !== 'stable') {
                        return;
                    }

                    await pc.setLocalDescription(offer);

                    if (pc.localDescription) {
                        socket.emit('webrtc:offer', {
                            to: peerId,
                            description: pc.localDescription,
                        });
                    }
                } catch (error) {
                    console.error('WebRTC negotiation failed', error);
                } finally {
                    makingOffer.current.delete(peerId);
                }
            };
        }
    }, [
        participants,
        selfId,
        isSupported,
        clearConnectionTimeout,
        startConnectionTimeout,
    ]);

    /*
     * =============================================================
     * РЕКОНСИЛЯЦИЯ ЛОКАЛЬНЫХ ТРЕКОВ
     * =============================================================
     *
     * Срабатывает при каждом изменении локального MediaStream:
     * включение/выключение микрофона, камеры, замена устройства.
     *
     * Трансиверы уже существуют (созданы в эффекте выше), поэтому
     * здесь только replaceTrack. addTrack/addTransceiver не нужны.
     *
     * replaceTrack(null) безопасен: m-line остаётся, renegotiation
     * не запускается, удалённый пир продолжает слать нам видео
     * по video-трансиверу.
     *
     * Сериализация per-peer: если пир уже в процессе реконсиляции,
     * пропускаем итерацию, чтобы не устроить одновременные
     * replaceTrack на нескольких sender'ах одного PC.
     */
    useEffect(() => {
        const audioTrack = stream?.getAudioTracks()[0] ?? null;
        const videoTrack = stream?.getVideoTracks()[0] ?? null;

        for (const [peerId, pc] of peerConnections.current) {
            if (renegotiating.current.has(peerId)) {
                continue;
            }

            /*
             * Ищем трансиверы по kind receiver'а:
             * receiver.track.kind — это то, что мы ожидаем получить.
             * Он не зависит от того, привязан ли сейчас sender.
             */
            const audioTransceiver = pc
                .getTransceivers()
                .find((t) => t.receiver.track?.kind === 'audio');

            const videoTransceiver = pc
                .getTransceivers()
                .find((t) => t.receiver.track?.kind === 'video');

            void (async () => {
                renegotiating.current.add(peerId);

                try {
                    if (audioTransceiver) {
                        await audioTransceiver.sender.replaceTrack(audioTrack);
                    }

                    if (videoTransceiver) {
                        await videoTransceiver.sender.replaceTrack(videoTrack);
                    }
                } catch (error) {
                    console.error(
                        'Local track reconciliation failed',
                        peerId,
                        error,
                    );
                } finally {
                    renegotiating.current.delete(peerId);
                }
            })();
        }
    }, [stream]);

    /*
     * =============================================================
     * SIGNALING
     * =============================================================
     */
    useEffect(() => {
        const onOffer = async ({
            from,
            description,
        }: {
            from: string;
            description: RTCSessionDescriptionInit;
        }) => {
            const pc = peerConnections.current.get(from);

            if (!pc || !description) {
                return;
            }

            const offerCollision =
                description.type === 'offer' &&
                (makingOffer.current.has(from) ||
                    pc.signalingState !== 'stable');

            /*
             * Лексикографически больший ID — polite peer.
             */
            const polite = selfId.localeCompare(from) > 0;

            if (offerCollision && !polite) {
                return;
            }

            try {
                if (offerCollision && polite) {
                    await pc.setLocalDescription({ type: 'rollback' });
                }

                await pc.setRemoteDescription(description);

                const queued = pendingIceCandidates.current.get(from) ?? [];

                for (const candidate of queued) {
                    await pc.addIceCandidate(candidate);
                }

                pendingIceCandidates.current.delete(from);

                if (description.type === 'offer') {
                    const answer = await pc.createAnswer();

                    await pc.setLocalDescription(answer);

                    if (pc.localDescription) {
                        socket.emit('webrtc:answer', {
                            to: from,
                            description: pc.localDescription,
                        });
                    }
                }
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

            if (!pc || !description) {
                return;
            }

            if (pc.signalingState !== 'have-local-offer') {
                return;
            }

            try {
                await pc.setRemoteDescription(description);

                const queued = pendingIceCandidates.current.get(from) ?? [];

                for (const candidate of queued) {
                    await pc.addIceCandidate(candidate);
                }

                pendingIceCandidates.current.delete(from);
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

            if (!pc || !candidate) {
                return;
            }

            try {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(candidate);
                } else {
                    const queued = pendingIceCandidates.current.get(from) ?? [];

                    queued.push(candidate);

                    pendingIceCandidates.current.set(from, queued);
                }
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
    }, [selfId]);

    /*
     * Закрытие всех PC при размонтировании.
     */
    useEffect(() => {
        const timeouts = connectionTimeouts.current;
        const restarts = lastIceRestart.current;

        return () => {
            peerConnections.current.forEach((pc) => pc.close());
            peerConnections.current.clear();
            makingOffer.current.clear();
            renegotiating.current.clear();
            pendingIceCandidates.current.clear();

            timeouts.forEach((t) => clearTimeout(t));
            timeouts.clear();
            restarts.clear();
        };
    }, []);

    /*
     * Разблокировка удалённого звука.
     */
    const enableRemoteAudio = useCallback(async () => {
        setAudioUnlocked(true);

        let blocked = false;

        const videos = Array.from(
            document.querySelectorAll<HTMLVideoElement>('.video-tile video'),
        );

        for (const video of videos) {
            if (video.dataset.self === 'true') {
                continue;
            }

            video.muted = false;

            try {
                await video.play();
            } catch {
                blocked = true;
            }
        }

        setAudioNeedsGesture(blocked);
    }, []);

    return {
        remoteStreams,
        peerStates,
        audioUnlocked,
        audioNeedsGesture,
        enableRemoteAudio,
    };
}
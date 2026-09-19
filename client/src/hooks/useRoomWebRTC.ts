import { useCallback, useEffect, useRef, useState } from 'react';
import { Participant } from '../commons/dto';
import { RTC_CONFIGURATION } from '../commons/webrtc';
import { socket } from '../config/socket';

type UseRoomWebRTCParams = {
    selfId: string;
    participants: Participant[];
    stream: MediaStream | null;
    isSupported: boolean;
};

type UseRoomWebRTCResult = {
    remoteStreams: Record<string, MediaStream>;
    peerStates: Record<string, string>;
    audioUnlocked: boolean;
    audioNeedsGesture: boolean;
    enableRemoteAudio: () => Promise<void>;
    registerVideoElement: (peerId: string, el: HTMLVideoElement | null) => void;
};

export function useRoomWebRTC({
    selfId,
    participants,
    stream,
    isSupported,
}: UseRoomWebRTCParams): UseRoomWebRTCResult {
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(
        new Map(),
    );
    const restartTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
        new Map(),
    );
    const restartInFlight = useRef<Set<string>>(new Set());
    const makingOffer = useRef<Set<string>>(new Set());

    // Registry of remote <video> elements, keyed by peerId. Populated by
    // VideoTile via registerVideoElement. Used to unlock audio without
    // relying on DOM selectors.
    const videoElements = useRef<Map<string, HTMLVideoElement>>(new Map());

    const streamRef = useRef<MediaStream | null>(stream);
    const selfIdRef = useRef(selfId);
    const participantsRef = useRef(participants);

    const [remoteStreams, setRemoteStreams] = useState<
        Record<string, MediaStream>
    >({});
    const [peerStates, setPeerStates] = useState<Record<string, string>>({});
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);

    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    useEffect(() => {
        selfIdRef.current = selfId;
    }, [selfId]);

    useEffect(() => {
        participantsRef.current = participants;
    }, [participants]);

    const registerVideoElement = useCallback(
        (peerId: string, el: HTMLVideoElement | null) => {
            if (el) {
                videoElements.current.set(peerId, el);

                // If audio was already unlocked, keep this element in sync.
                if (audioUnlocked) {
                    el.muted = false;
                    void el.play().catch(() => {
                        setAudioNeedsGesture(true);
                    });
                }
            } else {
                videoElements.current.delete(peerId);
            }
        },
        [audioUnlocked],
    );

    const flushPendingIce = useCallback(
        async (peerId: string, pc: RTCPeerConnection) => {
            if (!pc.remoteDescription) {
                return;
            }

            const queued = pendingIceCandidates.current.get(peerId);
            if (!queued?.length) {
                return;
            }

            pendingIceCandidates.current.delete(peerId);

            for (const candidate of queued) {
                try {
                    await pc.addIceCandidate(candidate);
                } catch (error) {
                    console.warn(
                        '[WebRTC] Failed to apply queued ICE candidate:',
                        peerId,
                        error,
                    );
                }
            }
        },
        [],
    );

    /**
     * Deterministic initiator: the peer with the lexicographically smaller ID
     * is the "impolite" peer and is allowed to initiate (re)negotiation.
     */
    const isInitiator = useCallback((peerId: string) => {
        const currentSelfId = selfIdRef.current;
        if (!currentSelfId) {
            return false;
        }
        return currentSelfId.localeCompare(peerId) < 0;
    }, []);

    const emitMediaState = useCallback(() => {
        const localStream = streamRef.current;
        if (!localStream) {
            return;
        }

        const audioEnabled = localStream
            .getAudioTracks()
            .some((track) => track.enabled && track.readyState === 'live');
        const videoEnabled = localStream
            .getVideoTracks()
            .some((track) => track.enabled && track.readyState === 'live');

        socket.emit('webrtc:media_state', {
            videoEnabled,
            audioEnabled,
        });
    }, []);

    const restartPeerConnection = useCallback(
        async (peerId: string) => {
            const pc = peerConnections.current.get(peerId);

            if (!pc || !isInitiator(peerId)) {
                return;
            }

            if (restartInFlight.current.has(peerId)) {
                return;
            }

            if (
                pc.signalingState !== 'stable' ||
                pc.connectionState === 'closed'
            ) {
                return;
            }

            restartInFlight.current.add(peerId);

            try {
                console.log('[WebRTC] ICE restart:', peerId);

                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);

                socket.emit('webrtc:offer', {
                    to: peerId,
                    description: pc.localDescription,
                });
            } catch (error) {
                console.error('[WebRTC] ICE restart failed:', peerId, error);
            } finally {
                restartInFlight.current.delete(peerId);
            }
        },
        [isInitiator],
    );

    const scheduleIceRestart = useCallback(
        (peerId: string) => {
            const existingTimer = restartTimers.current.get(peerId);
            if (existingTimer) {
                return;
            }

            const timer = setTimeout(() => {
                restartTimers.current.delete(peerId);
                void restartPeerConnection(peerId);
            }, 750);

            restartTimers.current.set(peerId, timer);
        },
        [restartPeerConnection],
    );

    const createPeerConnection = useCallback(
        (peerId: string): RTCPeerConnection => {
            const existing = peerConnections.current.get(peerId);
            if (existing && existing.connectionState !== 'closed') {
                return existing;
            }

            console.log('[WebRTC] Creating peer connection:', peerId);

            const pc = new RTCPeerConnection(RTC_CONFIGURATION);
            peerConnections.current.set(peerId, pc);

            const localStream = streamRef.current;
            if (localStream) {
                for (const track of localStream.getTracks()) {
                    try {
                        pc.addTrack(track, localStream);
                    } catch (error) {
                        console.error(
                            '[WebRTC] addTrack failed:',
                            peerId,
                            track.kind,
                            error,
                        );
                    }
                }
            }

            pc.ontrack = (event) => {
                console.log('[WebRTC] Remote track:', peerId, event.track.kind);

                const remoteStream =
                    event.streams[0] ?? new MediaStream([event.track]);

                setRemoteStreams((current) => ({
                    ...current,
                    [peerId]: remoteStream,
                }));
            };

            pc.onicecandidate = (event) => {
                if (!event.candidate) {
                    console.log('[WebRTC] ICE gathering complete:', peerId);
                    return;
                }

                socket.emit('webrtc:ice', {
                    to: peerId,
                    candidate: event.candidate.toJSON(),
                });
            };

            pc.oniceconnectionstatechange = () => {
                console.log(
                    '[WebRTC] ICE connection state:',
                    peerId,
                    pc.iceConnectionState,
                );

                if (
                    pc.iceConnectionState === 'failed' ||
                    pc.iceConnectionState === 'disconnected'
                ) {
                    scheduleIceRestart(peerId);
                }
            };

            pc.onconnectionstatechange = () => {
                console.log(
                    '[WebRTC] Connection state:',
                    peerId,
                    pc.connectionState,
                );

                setPeerStates((current) => ({
                    ...current,
                    [peerId]: pc.connectionState,
                }));

                if (
                    pc.connectionState === 'failed' ||
                    pc.connectionState === 'disconnected'
                ) {
                    scheduleIceRestart(peerId);
                }
            };

            pc.onsignalingstatechange = () => {
                console.log(
                    '[WebRTC] Signaling state:',
                    peerId,
                    pc.signalingState,
                );
            };

            // Renegotiation: only the impolite peer initiates. This covers
            // tracks added after the initial offer (e.g. camera turned on).
            pc.onnegotiationneeded = () => {
                if (!isInitiator(peerId)) {
                    return;
                }

                if (makingOffer.current.has(peerId)) {
                    return;
                }

                makingOffer.current.add(peerId);

                void (async () => {
                    try {
                        // `setLocalDescription()` with no args performs implicit
                        // rollback if needed and creates a fresh offer.
                        await pc.setLocalDescription();
                        socket.emit('webrtc:offer', {
                            to: peerId,
                            description: pc.localDescription,
                        });
                        console.log('[WebRTC] Renegotiation offer sent:', peerId);
                    } catch (error) {
                        console.error(
                            '[WebRTC] Renegotiation failed:',
                            peerId,
                            error,
                        );
                    } finally {
                        makingOffer.current.delete(peerId);
                    }
                })();
            };

            return pc;
        },
        [scheduleIceRestart, isInitiator],
    );

    // React to local stream changes: replace/add tracks and broadcast state.
    useEffect(() => {
        streamRef.current = stream;

        if (!stream) {
            return;
        }

        for (const [peerId, pc] of peerConnections.current) {
            if (pc.connectionState === 'closed') {
                continue;
            }

            const audioTrack = stream.getAudioTracks()[0] ?? null;
            const videoTrack = stream.getVideoTracks()[0] ?? null;
            const senders = pc.getSenders();

            const audioSender = senders.find(
                (sender) => sender.track?.kind === 'audio',
            );
            const videoSender = senders.find(
                (sender) => sender.track?.kind === 'video',
            );

            if (audioSender) {
                void audioSender.replaceTrack(audioTrack).catch((error) => {
                    console.error(
                        '[WebRTC] Audio replaceTrack failed:',
                        peerId,
                        error,
                    );
                });
            } else if (audioTrack) {
                try {
                    pc.addTrack(audioTrack, stream);
                } catch (error) {
                    console.error(
                        '[WebRTC] add audio track failed:',
                        peerId,
                        error,
                    );
                }
            }

            if (videoSender) {
                void videoSender.replaceTrack(videoTrack).catch((error) => {
                    console.error(
                        '[WebRTC] Video replaceTrack failed:',
                        peerId,
                        error,
                    );
                });
            } else if (videoTrack) {
                try {
                    pc.addTrack(videoTrack, stream);
                } catch (error) {
                    console.error(
                        '[WebRTC] add video track failed:',
                        peerId,
                        error,
                    );
                }
            }
        }

        // Let peers know our current mic/camera state.
        emitMediaState();
    }, [stream, emitMediaState]);

    // Also broadcast media state when track enabled flags change.
    useEffect(() => {
        if (!stream) {
            return;
        }

        const handler = () => emitMediaState();
        const tracks = [...stream.getAudioTracks(), ...stream.getVideoTracks()];

        for (const track of tracks) {
            track.addEventListener('mute', handler);
            track.addEventListener('unmute', handler);
            track.addEventListener('ended', handler);
        }

        return () => {
            for (const track of tracks) {
                track.removeEventListener('mute', handler);
                track.removeEventListener('unmute', handler);
                track.removeEventListener('ended', handler);
            }
        };
    }, [stream, emitMediaState]);

    // Reconcile peers with the participants list.
    useEffect(() => {
        if (!isSupported || !selfId) {
            return;
        }

        const activePeerIds = new Set(
            participants
                .map((participant) => participant.id)
                .filter((id) => id !== selfId),
        );

        for (const [peerId, pc] of peerConnections.current) {
            if (activePeerIds.has(peerId)) {
                continue;
            }

            console.log('[WebRTC] Removing peer:', peerId);

            const timer = restartTimers.current.get(peerId);
            if (timer) {
                clearTimeout(timer);
                restartTimers.current.delete(peerId);
            }

            restartInFlight.current.delete(peerId);
            makingOffer.current.delete(peerId);
            videoElements.current.delete(peerId);

            pc.ontrack = null;
            pc.onicecandidate = null;
            pc.oniceconnectionstatechange = null;
            pc.onconnectionstatechange = null;
            pc.onsignalingstatechange = null;
            pc.onnegotiationneeded = null;

            try {
                pc.close();
            } catch {
                // Ignore close errors.
            }

            peerConnections.current.delete(peerId);
            pendingIceCandidates.current.delete(peerId);

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

        for (const participant of participants) {
            const peerId = participant.id;
            if (peerId === selfId) {
                continue;
            }

            const pc = createPeerConnection(peerId);

            // Kick off the initial offer if we are the impolite peer.
            // `onnegotiationneeded` will also fire once tracks are added, but
            // we send an explicit first offer to avoid waiting for that.
            if (
                stream &&
                isInitiator(peerId) &&
                pc.signalingState === 'stable' &&
                !pc.localDescription
            ) {
                void (async () => {
                    try {
                        console.log('[WebRTC] Creating offer:', peerId);
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);

                        socket.emit('webrtc:offer', {
                            to: peerId,
                            description: pc.localDescription,
                        });
                    } catch (error) {
                        console.error(
                            '[WebRTC] Offer creation failed:',
                            peerId,
                            error,
                        );
                    }
                })();
            }
        }
    }, [participants, selfId, stream, isSupported, createPeerConnection, isInitiator]);

    // Signaling listeners.
    useEffect(() => {
        if (!isSupported) {
            return;
        }

        const onOffer = async ({
            from,
            description,
        }: {
            from: string;
            description: RTCSessionDescriptionInit;
        }) => {
            if (!from || !description || from === selfIdRef.current) {
                return;
            }

            try {
                const pc = createPeerConnection(from);
                const polite = !isInitiator(from);

                // Perfect-negotiation-style collision handling.
                const offerCollision =
                    pc.signalingState !== 'stable' || makingOffer.current.has(from);

                if (!polite && offerCollision) {
                    console.warn(
                        '[WebRTC] Ignoring colliding offer (impolite):',
                        from,
                    );
                    return;
                }

                if (offerCollision) {
                    // Polite peer rolls back its own offer.
                    try {
                        await pc.setLocalDescription({ type: 'rollback' });
                    } catch (error) {
                        console.warn(
                            '[WebRTC] Rollback failed:',
                            from,
                            error,
                        );
                    }
                }

                await pc.setRemoteDescription(
                    new RTCSessionDescription(description),
                );

                await flushPendingIce(from, pc);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.emit('webrtc:answer', {
                    to: from,
                    description: pc.localDescription,
                });
            } catch (error) {
                console.error('[WebRTC] Offer handling failed:', from, error);
            }
        };

        const onAnswer = async ({
            from,
            description,
        }: {
            from: string;
            description: RTCSessionDescriptionInit;
        }) => {
            if (!from || !description || from === selfIdRef.current) {
                return;
            }

            try {
                const pc = createPeerConnection(from);

                if (pc.signalingState !== 'have-local-offer') {
                    console.warn(
                        '[WebRTC] Ignoring answer in signaling state:',
                        from,
                        pc.signalingState,
                    );
                    return;
                }

                await pc.setRemoteDescription(
                    new RTCSessionDescription(description),
                );

                await flushPendingIce(from, pc);
            } catch (error) {
                console.error('[WebRTC] Answer handling failed:', from, error);
            }
        };

        const onIce = async ({
            from,
            candidate,
        }: {
            from: string;
            candidate: RTCIceCandidateInit;
        }) => {
            if (!from || !candidate || from === selfIdRef.current) {
                return;
            }

            try {
                const pc = createPeerConnection(from);

                if (!pc.remoteDescription) {
                    const queue = pendingIceCandidates.current.get(from) ?? [];
                    queue.push(candidate);
                    pendingIceCandidates.current.set(from, queue);
                    return;
                }

                await pc.addIceCandidate(candidate);
            } catch (error) {
                console.warn(
                    '[WebRTC] ICE candidate handling failed:',
                    from,
                    error,
                );
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
    }, [isSupported, createPeerConnection, flushPendingIce, isInitiator]);

    // Cleanup on unmount.
    useEffect(() => {
        return () => {
            console.log('[WebRTC] Closing all connections');

            for (const timer of restartTimers.current.values()) {
                clearTimeout(timer);
            }
            restartTimers.current.clear();
            restartInFlight.current.clear();
            makingOffer.current.clear();
            videoElements.current.clear();

            for (const pc of peerConnections.current.values()) {
                pc.ontrack = null;
                pc.onicecandidate = null;
                pc.oniceconnectionstatechange = null;
                pc.onconnectionstatechange = null;
                pc.onsignalingstatechange = null;
                pc.onnegotiationneeded = null;

                try {
                    pc.close();
                } catch {
                    // Ignore close errors.
                }
            }

            peerConnections.current.clear();
            pendingIceCandidates.current.clear();
        };
    }, []);

    const enableRemoteAudio = useCallback(async () => {
        const elements = Array.from(videoElements.current.values());

        const results = await Promise.allSettled(
            elements.map(async (video) => {
                video.muted = false;
                await video.play();
            }),
        );

        const blocked = results.some((result) => result.status === 'rejected');

        setAudioUnlocked(!blocked);
        setAudioNeedsGesture(blocked);
    }, []);

    return {
        remoteStreams,
        peerStates,
        audioUnlocked,
        audioNeedsGesture,
        enableRemoteAudio,
        registerVideoElement,
    };
}
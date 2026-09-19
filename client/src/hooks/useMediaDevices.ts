import { useCallback, useEffect, useRef, useState } from 'react';

type UseMediaDevicesResult = {
    stream: MediaStream | null;

    isMicrophoneEnabled: boolean;
    isCameraEnabled: boolean;

    isMicrophoneAvailable: boolean;
    isCameraAvailable: boolean;

    toggleMicrophone: () => boolean | null;

    enableCamera: () => Promise<boolean>;
    disableCamera: () => boolean;

    error: string;
};

function describeMediaError(
    error: unknown,
    kind: 'audio' | 'video',
): string {
    if (!(error instanceof Error)) {
        return kind === 'video'
            ? 'Не удалось получить доступ к камере.'
            : 'Не удалось получить доступ к микрофону.';
    }

    switch (error.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return kind === 'video'
                ? 'Доступ к камере запрещён. Разрешите его в настройках браузера и обновите страницу.'
                : 'Доступ к микрофону запрещён. Разрешите его в настройках браузера и обновите страницу.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return kind === 'video'
                ? 'Камера не найдена. Подключите устройство или выберите его в настройках.'
                : 'Микрофон не найден. Подключите устройство или выберите его в настройках.';
        case 'NotReadableError':
        case 'AbortError':
            return kind === 'video'
                ? 'Камера занята другим приложением. Закройте его и попробуйте снова.'
                : 'Микрофон занят другим приложением. Закройте его и попробуйте снова.';
        default:
            return kind === 'video'
                ? 'Не удалось получить доступ к камере.'
                : 'Не удалось получить доступ к микрофону.';
    }
}

export function useMediaDevices(): UseMediaDevicesResult {
    const [stream, setStream] = useState<MediaStream | null>(null);

    const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);

    const [isMicrophoneAvailable, setIsMicrophoneAvailable] = useState(false);
    const [isCameraAvailable, setIsCameraAvailable] = useState(false);

    const [error, setError] = useState('');

    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    /**
     * Rebuilds the outgoing stream. Always returns a NEW MediaStream so
     * downstream effects (replaceTrack in useRoomWebRTC) re-run.
     */
    const rebuildStream = useCallback(() => {
        setStream((current) => {
            const tracks = current?.getTracks() ?? [];
            return tracks.length ? new MediaStream(tracks) : null;
        });
    }, []);

    /*
     * Initial media setup.
     *
     * Camera and microphone are requested separately, so a failure of
     * one does not prevent using the other. A denial leaves the user in
     * the room with the corresponding device disabled.
     */
    useEffect(() => {
        let cancelled = false;
        let ownedStream: MediaStream | null = null;

        async function requestMedia() {
            if (!navigator.mediaDevices?.getUserMedia) {
                setError('Браузер не поддерживает доступ к медиа-устройствам.');
                return;
            }

            const errors: string[] = [];

            let videoTrack: MediaStreamTrack | null = null;
            let audioTrack: MediaStreamTrack | null = null;

            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    video: true,
                });
                videoTrack = s.getVideoTracks()[0] ?? null;
            } catch (err) {
                errors.push(describeMediaError(err, 'video'));
            }

            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
                audioTrack = s.getAudioTracks()[0] ?? null;
            } catch (err) {
                errors.push(describeMediaError(err, 'audio'));
            }

            if (cancelled) {
                videoTrack?.stop();
                audioTrack?.stop();
                return;
            }

            const tracks: MediaStreamTrack[] = [];
            if (videoTrack) tracks.push(videoTrack);
            if (audioTrack) tracks.push(audioTrack);

            if (tracks.length === 0) {
                setStream(null);
                setIsCameraEnabled(false);
                setIsMicrophoneEnabled(false);
                setIsCameraAvailable(false);
                setIsMicrophoneAvailable(false);
                setError(errors.join(' ') || 'Не удалось получить доступ к устройствам.');
                return;
            }

            const combined = new MediaStream(tracks);
            ownedStream = combined;

            setStream(combined);
            setIsCameraAvailable(!!videoTrack);
            setIsMicrophoneAvailable(!!audioTrack);
            setIsCameraEnabled(!!videoTrack);
            setIsMicrophoneEnabled(!!audioTrack);
            setError(errors.join(' '));
        }

        void requestMedia();

        return () => {
            cancelled = true;
            ownedStream?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    /*
     * CAMERA
     *
     * Track "ended" fires when the device disappears (unplugged, taken
     * by the OS, permission revoked). We drop the track from the stream
     * so downstream consumers stop trying to use it, but we DO NOT
     * re-acquire automatically: the user must pick a device in the
     * browser/OS settings.
     */
    useEffect(() => {
        if (!stream) {
            return;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
            return;
        }

        const handleEnded = () => {
            if (!mountedRef.current) {
                return;
            }

            setStream((current) => {
                if (!current) {
                    return current;
                }
                current.removeTrack(videoTrack);
                const next = current.getTracks();
                return next.length ? new MediaStream(next) : null;
            });
            setIsCameraAvailable(false);
            setIsCameraEnabled(false);
            setError(
                'Камера отключена. Выберите устройство в настройках браузера или ОС.',
            );
        };

        videoTrack.addEventListener('ended', handleEnded);
        return () => {
            videoTrack.removeEventListener('ended', handleEnded);
        };
    }, [stream]);

    /*
     * MICROPHONE
     *
     * Same as camera: drop the track on "ended", do not re-acquire.
     */
    useEffect(() => {
        if (!stream) {
            return;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
            return;
        }

        const handleEnded = () => {
            if (!mountedRef.current) {
                return;
            }

            setStream((current) => {
                if (!current) {
                    return current;
                }
                current.removeTrack(audioTrack);
                const next = current.getTracks();
                return next.length ? new MediaStream(next) : null;
            });
            setIsMicrophoneAvailable(false);
            setIsMicrophoneEnabled(false);
            setError(
                'Микрофон отключён. Выберите устройство в настройках браузера или ОС.',
            );
        };

        audioTrack.addEventListener('ended', handleEnded);
        return () => {
            audioTrack.removeEventListener('ended', handleEnded);
        };
    }, [stream]);

    /*
     * devicechange: only refresh availability flags. Never call
     * getUserMedia here — the user restores devices manually.
     */
    useEffect(() => {
        if (!navigator.mediaDevices?.addEventListener) {
            return;
        }

        const handler = async () => {
            try {
                const devices =
                    await navigator.mediaDevices.enumerateDevices();
                if (!mountedRef.current) {
                    return;
                }
                setIsCameraAvailable(
                    devices.some((d) => d.kind === 'videoinput'),
                );
                setIsMicrophoneAvailable(
                    devices.some((d) => d.kind === 'audioinput'),
                );
            } catch {
                // Ignore enumerate errors.
            }
        };

        navigator.mediaDevices.addEventListener('devicechange', handler);
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', handler);
        };
    }, []);

    /*
     * MICROPHONE
     *
     * Intentional ON/OFF. Releasing the device (stop) so the OS-level
     * indicator turns off, and re-acquiring on enable.
     */
    function toggleMicrophone(): boolean | null {
        if (!stream) {
            return null;
        }

        const audioTrack = stream.getAudioTracks()[0];

        // Turning OFF.
        if (audioTrack) {
            audioTrack.stop();
            stream.removeTrack(audioTrack);
            rebuildStream();
            setIsMicrophoneEnabled(false);
            setIsMicrophoneAvailable(false);
            return false;
        }

        // Turning ON.
        void (async () => {
            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
                const newTrack = s.getAudioTracks()[0];
                if (!newTrack || !mountedRef.current) {
                    newTrack?.stop();
                    return;
                }

                setStream((current) => {
                    if (!current) {
                        return new MediaStream([newTrack]);
                    }
                    current.addTrack(newTrack);
                    return new MediaStream(current.getTracks());
                });
                setIsMicrophoneEnabled(true);
                setIsMicrophoneAvailable(true);
                setError('');
            } catch (err) {
                if (!mountedRef.current) {
                    return;
                }
                setIsMicrophoneAvailable(false);
                setIsMicrophoneEnabled(false);
                setError(describeMediaError(err, 'audio'));
            }
        })();

        return null;
    }

    /*
     * CAMERA
     *
     * Intentional ON. Re-acquires a fresh video track. Releases the
     * previous one if it is somehow still live.
     */
    async function enableCamera(): Promise<boolean> {
        if (!navigator.mediaDevices?.getUserMedia) {
            setError('Браузер не поддерживает доступ к камере.');
            return false;
        }

        if (stream?.getVideoTracks().some((t) => t.readyState === 'live')) {
            // Already on.
            return true;
        }

        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: true,
            });
            const newTrack = s.getVideoTracks()[0];
            if (!newTrack) {
                return false;
            }

            if (!mountedRef.current) {
                newTrack.stop();
                return false;
            }

            setStream((current) => {
                if (!current) {
                    return new MediaStream([newTrack]);
                }

                current.getVideoTracks().forEach((track) => {
                    track.stop();
                    current.removeTrack(track);
                });
                current.addTrack(newTrack);

                return new MediaStream(current.getTracks());
            });

            setIsCameraAvailable(true);
            setIsCameraEnabled(true);
            setError('');
            return true;
        } catch (err) {
            if (!mountedRef.current) {
                return false;
            }
            setIsCameraAvailable(false);
            setIsCameraEnabled(false);
            setError(describeMediaError(err, 'video'));
            return false;
        }
    }

    /*
     * CAMERA
     *
     * Intentional OFF. Stops the track, releasing the camera physically
     * so the OS indicator turns off. The device remains available.
     */
    function disableCamera(): boolean {
        if (!stream) {
            setIsCameraEnabled(false);
            return false;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
            setIsCameraEnabled(false);
            return false;
        }

        // track.stop() — releases the device.
        videoTrack.stop();
        stream.removeTrack(videoTrack);

        rebuildStream();
        setIsCameraEnabled(false);
        // NOTE: isCameraAvailable stays true — the device is still there,
        // it is just turned off.

        return true;
    }

    return {
        stream,

        isMicrophoneEnabled,
        isCameraEnabled,

        isMicrophoneAvailable,
        isCameraAvailable,

        toggleMicrophone,

        enableCamera,
        disableCamera,

        error,
    };
}
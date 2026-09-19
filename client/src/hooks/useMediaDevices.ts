import { useEffect, useState } from 'react';
import { socket } from '../config/socket';

type UseMediaDevicesResult = {
    stream: MediaStream | null;
    isMicrophoneEnabled: boolean;
    isCameraEnabled: boolean;
    toggleMicrophone: () => boolean | null;
    enableCamera: () => Promise<boolean>;
    disableCamera: () => boolean;
    error: string;
};

export function useMediaDevices(): UseMediaDevicesResult {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let currentStream: MediaStream | null = null;

        async function requestMedia() {
            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {
                socket.emit('webrtc:media_state', {
                    videoEnabled: false,
                    audioEnabled: false,
                });

                return;
            }

            try {
                currentStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });

                setStream(currentStream);

                const audioEnabled = currentStream
                    .getAudioTracks()
                    .some(
                        (track) => track.readyState === 'live' && track.enabled,
                    );

                const videoEnabled = currentStream
                    .getVideoTracks()
                    .some(
                        (track) => track.readyState === 'live' && track.enabled,
                    );

                setIsMicrophoneEnabled(audioEnabled);
                setIsCameraEnabled(videoEnabled);

                socket.emit('webrtc:media_state', {
                    audioEnabled,
                    videoEnabled,
                });

                setError('');
            } catch {
                setIsMicrophoneEnabled(false);
                setIsCameraEnabled(false);

                socket.emit('webrtc:media_state', {
                    audioEnabled: false,
                    videoEnabled: false,
                });

                setError(
                    'Не удалось получить доступ к камере или микрофону. Вы можете продолжить без них.',
                );
            }
        }
        requestMedia();

        return () => {
            currentStream?.getTracks().forEach((track) => {
                track.stop();
            });
        };
    }, []);

    useEffect(() => {
        if (!stream) {
            return;
        }

        function handleTrackEnded(event: Event) {
            const track = event.target as MediaStreamTrack;

            if (track.kind === 'video') {
                setIsCameraEnabled(false);

                socket.emit('webrtc:media_state', {
                    videoEnabled: false,
                });

                setError(
                    'Камера стала недоступна. Подключите камеру и проверьте разрешение в настройках браузера или операционной системы.',
                );
            }

            if (track.kind === 'audio') {
                setIsMicrophoneEnabled(false);

                socket.emit('webrtc:media_state', {
                    audioEnabled: false,
                });

                setError(
                    'Микрофон стал недоступен. Подключите микрофон и проверьте разрешение в настройках браузера или операционной системы.',
                );
            }
        }

        const tracks = stream.getTracks();

        tracks.forEach((track) => {
            track.addEventListener('ended', handleTrackEnded);
        });

        return () => {
            tracks.forEach((track) => {
                track.removeEventListener('ended', handleTrackEnded);
            });
        };
    }, [stream]);

    useEffect(() => {
        if (!navigator.mediaDevices) {
            return;
        }

        function handleDeviceChange() {
            if (!stream) return;

            const audioEnabled = stream
                .getAudioTracks()
                .some(
                    (track) =>
                        track.readyState === 'live' &&
                        track.enabled,
                );

            const videoEnabled = stream
                .getVideoTracks()
                .some(
                    (track) =>
                        track.readyState === 'live' &&
                        track.enabled,
                );

            setIsMicrophoneEnabled(audioEnabled);
            setIsCameraEnabled(videoEnabled);

            socket.emit('webrtc:media_state', {
                audioEnabled,
                videoEnabled,
            });

            setError(
                'Устройство камеры или микрофона изменилось. Проверьте подключение устройства и разрешения браузера.',
            );
        }

        navigator.mediaDevices.addEventListener(
            'devicechange',
            handleDeviceChange,
        );

        return () => {
            navigator.mediaDevices.removeEventListener(
                'devicechange',
                handleDeviceChange,
            );
        };
    }, [stream]);

    function toggleMicrophone(): boolean | null {
        if (!stream) {
            return null;
        }

        const enabled = !isMicrophoneEnabled;

        stream.getAudioTracks().forEach((track) => {
            track.enabled = enabled;
        });

        setIsMicrophoneEnabled(enabled);
        socket.emit('webrtc:media_state', {
            audioEnabled: enabled,
        });

        return enabled;
    }

    async function enableCamera(): Promise<boolean> {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return false;
        }

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: true,
            });

            const newVideoTrack = newStream.getVideoTracks()[0];

            if (!newVideoTrack) {
                newStream.getTracks().forEach((track) => {
                    track.stop();
                });

                return false;
            }

            setStream((currentStream) => {
                if (!currentStream) {
                    return newStream;
                }

                currentStream.addTrack(newVideoTrack);

                return currentStream;
            });

            setIsCameraEnabled(true);
            socket.emit('webrtc:media_state', {
                videoEnabled: true,
            });
            setError('');

            return true;
        } catch {
            setError(
                'Не удалось включить камеру. Проверьте разрешение камеры в настройках браузера или операционной системы.',
            );

            return false;
        }
    }

    function disableCamera(): boolean {
        if (!stream) {
            return false;
        }

        stream.getVideoTracks().forEach((track) => {
            track.enabled = false;
        });

        setIsCameraEnabled(false);
        socket.emit('webrtc:media_state', {
            videoEnabled: false,
        });

        return true;
    }

    return {
        stream,
        isMicrophoneEnabled,
        isCameraEnabled,
        toggleMicrophone,
        enableCamera,
        disableCamera,
        error,
    };
}

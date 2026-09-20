import { useEffect, useRef, useState } from 'react';

import { socket } from '../config/socket';
import { NotificationStatus } from '../commons/dto';

type UseMediaDevicesResult = {
    stream: MediaStream | null;

    isMicrophoneEnabled: boolean;
    isCameraEnabled: boolean;

    isMicrophoneAvailable: boolean;
    isCameraAvailable: boolean;

    toggleMicrophone: () => boolean | null;

    enableCamera: () => Promise<boolean>;
    disableCamera: () => boolean;

    error: NotificationStatus | null;
    errorKey: number;
};

export function useMediaDevices(): UseMediaDevicesResult {
    const [stream, setStream] = useState<MediaStream | null>(null);

    const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);

    const [isMicrophoneAvailable, setIsMicrophoneAvailable] = useState(false);
    const [isCameraAvailable, setIsCameraAvailable] = useState(false);

    const [error, setError] = useState<NotificationStatus | null>(null);
    const [errorKey, showErrorKey] = useState(0);
    function showError(v: NotificationStatus | null) {
        setError(v);
        showErrorKey((current) => current + 1);
    }

    const cameraWasUnavailable = useRef(false);
    const microphoneWasUnavailable = useRef(false);

    // Запрос доступа к камере и микрофону при монтировании компонента.
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

            let videoStream: MediaStream | null = null;
            let audioStream: MediaStream | null = null;

            // Camera
            try {
                videoStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                });
            } catch {
                cameraWasUnavailable.current = true;
                showError({
                    type: 'error',
                    message: 'Не удалось включить камеру. Возможно, она выключена или отсутствует Возможно, она выключена или отсутствует.',
                });
            }

            // Microphone
            try {
                audioStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
            } catch {
                microphoneWasUnavailable.current = true;
                showError({
                    type: 'error',
                    message: 'Не удалось включить микрофон. Возможно, он выключен или отсутствует.',
                });
            }

            const tracks = [
                ...(videoStream?.getVideoTracks() ?? []),
                ...(audioStream?.getAudioTracks() ?? []),
            ];

            if (tracks.length === 0) {
                setStream(null);
                setIsCameraEnabled(false);
                setIsMicrophoneEnabled(false);

                socket.emit('webrtc:media_state', {
                    videoEnabled: false,
                    audioEnabled: false,
                });

                showError({
                    type: 'error',
                    message: 'Не удалось получить доступ к камере или микрофону.',
                });

                return;
            }

            const combinedStream = new MediaStream(tracks);

            currentStream = combinedStream;

            setStream(combinedStream);

            const cameraAvailable = combinedStream
                .getVideoTracks()
                .some((track) => track.readyState === 'live');

            const microphoneAvailable = combinedStream
                .getAudioTracks()
                .some((track) => track.readyState === 'live');
            setIsCameraAvailable(cameraAvailable);
            setIsMicrophoneAvailable(microphoneAvailable);

            const videoEnabled = combinedStream
                .getVideoTracks()
                .some((track) => track.readyState === 'live' && track.enabled);

            const audioEnabled = combinedStream
                .getAudioTracks()
                .some((track) => track.readyState === 'live' && track.enabled);

            setIsCameraEnabled(videoEnabled);
            setIsMicrophoneEnabled(audioEnabled);

            socket.emit('webrtc:media_state', {
                videoEnabled,
                audioEnabled,
            });

            showError(null);
        }

        void requestMedia();

        return () => {
            currentStream?.getTracks().forEach((track) => {
                track.stop();
            });
        };
    }, []);

    /*
     * MICROPHONE
     */
    useEffect(() => {
        if (!stream) {
            return;
        }

        const audioTrack = stream.getAudioTracks()[0];

        if (!audioTrack) {
            microphoneWasUnavailable.current = true;
            return;
        }

        const handleEnded = () => {
            microphoneWasUnavailable.current = true;

            setIsMicrophoneAvailable(false);
            setIsMicrophoneEnabled(false);

            socket.emit('webrtc:media_state', {
                audioEnabled: false,
            });
        };

        audioTrack.addEventListener('ended', handleEnded);

        return () => {
            audioTrack.removeEventListener('ended', handleEnded);
        };
    }, [stream]);

    useEffect(() => {
        if (!navigator.mediaDevices) {
            return;
        }

        async function handleMicrophoneDeviceChange() {
            if (!stream) {
                return;
            }

            const existingAudioTrack = stream.getAudioTracks()[0];

            /*
             * Microphone is still available.
             * Do not change its enabled state.
             */
            if (
                existingAudioTrack &&
                existingAudioTrack.readyState === 'live'
            ) {
                microphoneWasUnavailable.current = false;
                return;
            }

            /*
             * Microphone was not physically unavailable.
             */
            if (!microphoneWasUnavailable.current) {
                return;
            }

            try {
                const newStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });

                const newAudioTrack = newStream.getAudioTracks()[0];

                if (!newAudioTrack) {
                    return;
                }

                setStream((currentStream) => {
                    if (!currentStream) {
                        return newStream;
                    }

                    currentStream.addTrack(newAudioTrack);
                    return currentStream;
                });
                setIsMicrophoneAvailable(true);
                setIsMicrophoneEnabled(true);

                microphoneWasUnavailable.current = false;

                socket.emit('webrtc:media_state', {
                    audioEnabled: true,
                });

                showError(null);
            } catch {
                showError({
                    type: 'error',
                    message: 'Не удалось включить микрофон.',
                });
            }
        }

        navigator.mediaDevices.addEventListener(
            'devicechange',
            handleMicrophoneDeviceChange,
        );

        return () => {
            navigator.mediaDevices.removeEventListener(
                'devicechange',
                handleMicrophoneDeviceChange,
            );
        };
    }, [stream]);

    function toggleMicrophone(): boolean | null {
        if (!stream) {
            return null;
        }

        const audioTracks = stream.getAudioTracks();

        if (audioTracks.length === 0) {
            return null;
        }

        const enabled = !isMicrophoneEnabled;

        audioTracks.forEach((track) => {
            if (track.readyState === 'live') {
                track.enabled = enabled;
            }
        });

        setIsMicrophoneEnabled(enabled);

        socket.emit('webrtc:media_state', {
            audioEnabled: enabled,
        });

        return enabled;
    }

    /*
     * CAMERA
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
            cameraWasUnavailable.current = true;

            const nextStream = new MediaStream();
            stream.getAudioTracks().forEach((track) => {
                nextStream.addTrack(track);
            });

            setStream(nextStream);
            setIsCameraAvailable(false);
            setIsCameraEnabled(false);

            socket.emit('webrtc:media_state', {
                videoEnabled: false,
            });
        };

        videoTrack.addEventListener('ended', handleEnded);

        return () => {
            videoTrack.removeEventListener('ended', handleEnded);
        };
    }, [stream]);

    useEffect(() => {
        if (!navigator.mediaDevices) {
            return;
        }

        async function handleCameraDeviceChange() {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some((d) => d.kind === 'videoinput');

            if (hasCamera && !isCameraAvailable) {
                setIsCameraAvailable(true);
            } else if (!hasCamera && isCameraAvailable) {
                setIsCameraAvailable(false);
                setIsCameraEnabled(false);
            }
        }

        navigator.mediaDevices.addEventListener(
            'devicechange',
            handleCameraDeviceChange,
        );
        void handleCameraDeviceChange();

        return () => {
            navigator.mediaDevices.removeEventListener(
                'devicechange',
                handleCameraDeviceChange,
            );
        };
    }, [isCameraAvailable]);

    async function enableCamera(): Promise<boolean> {
        if (!navigator.mediaDevices?.getUserMedia) {
            return false;
        }

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: true,
            });

            const newVideoTrack = newStream.getVideoTracks()[0];

            if (!newVideoTrack) {
                return false;
            }

            setStream((currentStream) => {
                if (!currentStream) {
                    return newStream;
                }

                const nextStream = new MediaStream();

                currentStream.getAudioTracks().forEach((track) => {
                    nextStream.addTrack(track);
                });

                currentStream.getVideoTracks().forEach((track) => {
                    track.stop();
                });

                nextStream.addTrack(newVideoTrack);

                return nextStream;
            });

            setIsCameraAvailable(true);
            setIsCameraEnabled(true);

            socket.emit('webrtc:media_state', {
                videoEnabled: true,
            });

            return true;
        } catch (error: Error | unknown) {
            if (error instanceof Error) {
                switch (error.name) {
                    case 'NotAllowedError':
                        showError({
                            type: 'error',
                            message: 'Доступ к камере запрещён. Разрешите доступ в настройках браузера.',
                        });
                        break;
                    default:
                        showError({
                            type: 'error',
                            message: 'Не удалось включить камеру. Возможно, она выключена или отсутствует',
                        });
                        break;
                }
            }

            setIsCameraAvailable(false);
            setIsCameraEnabled(false);

            socket.emit('webrtc:media_state', {
                videoEnabled: false,
            });

            return false;
        }
    }

    function disableCamera(): boolean {
        if (!stream) {
            return false;
        }

        const videoTracks = stream.getVideoTracks();

        if (videoTracks.length === 0) {
            setIsCameraEnabled(false);
            socket.emit('webrtc:media_state', {
                videoEnabled: false,
            });
            return false;
        }

        const nextStream = new MediaStream();

        stream.getAudioTracks().forEach((track) => {
            nextStream.addTrack(track);
        });

        videoTracks.forEach((track) => {
            track.stop();
        });

        setStream(nextStream);
        setIsCameraEnabled(false);
        setIsCameraAvailable(true);

        socket.emit('webrtc:media_state', {
            videoEnabled: false,
        });

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
        errorKey
    };
}

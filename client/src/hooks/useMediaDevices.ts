import { useEffect, useRef, useState } from 'react';

import { socket } from '../config/socket';

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

export function useMediaDevices(): UseMediaDevicesResult {
    const [stream, setStream] = useState<MediaStream | null>(null);

    const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);

    const [isMicrophoneAvailable, setIsMicrophoneAvailable] = useState(false);
    const [isCameraAvailable, setIsCameraAvailable] = useState(false);

    const [error, setError] = useState('');

    const cameraWasUnavailable = useRef(false);
    const microphoneWasUnavailable = useRef(false);

    /*
     * Initial media setup.
     *
     * Camera and microphone are requested separately,
     * so failure of one device does not prevent using the other.
     */
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
            }

            // Microphone
            try {
                audioStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
            } catch {
                microphoneWasUnavailable.current = true;
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

                setError('Не удалось получить доступ к камере или микрофону.');

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

            setError('');
        }

        void requestMedia();

        return () => {
            currentStream?.getTracks().forEach((track) => {
                track.stop();
            });
        };
    }, []);

    /*
     * CAMERA
     *
     * Detect physical camera removal.
     *
     * When the track ends, remove it from our MediaStream immediately.
     * Do NOT request a replacement here: recovery must happen only after
     * the user explicitly selects/restores a device in browser/OS settings
     * and then enables the camera again.
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
    }, [stream, socket]);

    /*
     * Camera recovery is intentionally manual.
     *
     * A browser/OS device change does not automatically call getUserMedia().
     * The user must restore/select the camera in system/browser settings and
     * explicitly enable it again.
     */

    /*
     * MICROPHONE
     *
     * Detect physical microphone removal.
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

    /*
     * MICROPHONE
     *
     * Detect microphone device changes.
     */
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

                setError('');
            } catch {
                // Microphone is still unavailable.
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

    /*
     * MICROPHONE
     *
     * Intentional ON/OFF.
     *
     * We use track.enabled instead of stop().
     */
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
     *
     *  detect camera device changes.
     *  When the camera is physically removed, we stop the track and mark it as unavailable.
     *  When the camera is physically restored, we can re-enable it by calling enableCamera().
    */
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

    /*
     * CAMERA
     *
     * Intentional ON.
     */
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
        } catch (error) {
            console.error('[enableCamera] failed:', error);
            setIsCameraAvailable(false);
            setIsCameraEnabled(false);

            socket.emit('webrtc:media_state', {
                videoEnabled: false,
            });

            return false;
        }
    }

    /*
     * CAMERA
     *
     * Intentional OFF.
     *
     * A new MediaStream is returned so useRoomWebRTC reconciles the video
     * sender. The old video track is stopped because this toggle represents
     * releasing the camera; enabling it later acquires a fresh track.
     */
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
        // Turning the camera off releases the track, but does not mean that
        // the physical camera disappeared. It can be acquired again explicitly.
        setIsCameraAvailable(true);

        socket.emit('webrtc:media_state', {
            videoEnabled: false,
        });

        return true;
    }

    /*
     * Availability is based on readyState,
     * NOT on enabled.
     *
     * Therefore an intentionally disabled camera/microphone
     * is still considered available.
     */
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

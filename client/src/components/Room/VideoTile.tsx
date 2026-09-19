import { useEffect, useRef, useState } from 'react';

type VideoTileProps = {
    peerId: string;
    name: string;
    isSelf?: boolean;
    stream?: MediaStream | null;
    microphoneEnabled?: boolean;
    remoteAudioAvailable?: boolean;
    remoteVideoAvailable?: boolean;
    connectionState?: string;
    audioEnabled?: boolean;
    registerVideoElement?: (peerId: string, el: HTMLVideoElement | null) => void;
};

function VideoTile({
    peerId,
    name,
    isSelf = false,
    stream = null,
    microphoneEnabled = false,
    remoteAudioAvailable = true,
    remoteVideoAvailable = true,
    connectionState = 'connected',
    audioEnabled = false,
    registerVideoElement,
}: VideoTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playBlocked, setPlayBlocked] = useState(false);

    const hasVideo = !!stream
        ?.getVideoTracks()
        .some((track) => track.readyState === 'live' && track.enabled);

    const hasAudio = !!stream
        ?.getAudioTracks()
        .some((track) => track.readyState === 'live');

    const shouldShowVideo = hasVideo && (isSelf || remoteVideoAvailable);

    // Show a "mic off" indicator when the tile's audio is not available.
    const shouldShowMicrophoneOff = isSelf
        ? !microphoneEnabled
        : !remoteAudioAvailable || !hasAudio;

    const shouldShowCameraOff = !shouldShowVideo;

    const stateLabel =
        connectionState === 'connected'
            ? ''
            : connectionState === 'failed'
              ? ' · Нет соединения'
              : connectionState === 'disconnected'
                ? ' · Соединение прервано'
                : ' · Подключение…';

    // Register this element so the room can unmute/unlock it on demand.
    useEffect(() => {
        const video = videoRef.current;
        if (!video || isSelf || !registerVideoElement) {
            return;
        }

        registerVideoElement(peerId, video);

        return () => {
            registerVideoElement(peerId, null);
        };
    }, [peerId, isSelf, registerVideoElement]);

    useEffect(() => {
        const video = videoRef.current;

        if (!video) {
            return;
        }

        video.srcObject = stream;

        return () => {
            if (video.srcObject === stream) {
                video.srcObject = null;
            }
        };
    }, [stream]);

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !stream || isSelf) {
            return;
        }

        video.muted = !audioEnabled;

        // Attempt playback even for audio-only streams so we can detect
        // autoplay blocking.
        void video
            .play()
            .then(() => setPlayBlocked(false))
            .catch(() => setPlayBlocked(true));
    }, [stream, isSelf, audioEnabled]);

    return (
        <div className="video-tile">
            <video
                ref={videoRef}
                data-self={isSelf ? 'true' : 'false'}
                data-peer-id={peerId}
                autoPlay
                playsInline
                muted={isSelf || !audioEnabled}
                style={{
                    display: shouldShowVideo ? 'block' : 'none',
                }}
            />

            {!shouldShowVideo && (
                <div className="video-placeholder">
                    <div className="video-placeholder-avatar">
                        {name.charAt(0).toUpperCase() || '?'}
                    </div>

                    <div>{name}</div>

                    {!isSelf && stateLabel}
                </div>
            )}

            {playBlocked && !isSelf && (
                <div className="video-play-hint">
                    Нажмите «Разрешить звук участников», чтобы слышать
                    собеседников.
                </div>
            )}

            <div className="video-tile-name">
                {name}
                {isSelf && ' (Вы)'}

                {shouldShowMicrophoneOff && (
                    <span
                        className="microphone-off"
                        title="Микрофон выключен"
                        aria-label="Микрофон выключен"
                    >
                        🔇
                    </span>
                )}

                {shouldShowCameraOff && (
                    <span
                        className="camera-off"
                        title="Камера выключена"
                        aria-label="Камера выключена"
                    >
                        🚫
                    </span>
                )}

                {stateLabel}
            </div>
        </div>
    );
}

export default VideoTile;
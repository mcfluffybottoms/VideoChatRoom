import { useEffect, useRef, useState } from 'react';

type VideoTileProps = {
    name: string;
    isSelf?: boolean;
    stream?: MediaStream | null;
    microphoneEnabled?: boolean;
    remoteAudioAvailable?: boolean;
    remoteVideoAvailable?: boolean;
    connectionState?: string;
    audioEnabled?: boolean;
};

function VideoTile({
    name,
    isSelf = false,
    stream = null,
    microphoneEnabled = false,
    remoteAudioAvailable = true,
    remoteVideoAvailable = true,
    connectionState = 'connected',
    audioEnabled = false,
}: VideoTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playBlocked, setPlayBlocked] = useState(false);

    const hasVideo = !!stream
        ?.getVideoTracks()
        .some((track) => track.readyState === 'live' && track.enabled);

    // For yourself, use the actual local track.
    // For remote users, also require the state received through Socket.IO.
    const shouldShowVideo = hasVideo && (isSelf || remoteVideoAvailable);

    useEffect(() => {
        const video = videoRef.current;

        if (!video) return;

        video.srcObject = stream;
        video.muted = isSelf || !audioEnabled;

        if (stream && shouldShowVideo) {
            void video
                .play()
                .then(() => setPlayBlocked(false))
                .catch(() => setPlayBlocked(true));
        }

        return () => {
            if (video.srcObject === stream) {
                video.srcObject = null;
            }
        };
    }, [stream, isSelf, audioEnabled, shouldShowVideo]);

    const stateLabel =
        connectionState === 'connected'
            ? ''
            : connectionState === 'failed'
              ? ' · Нет соединения'
              : connectionState === 'disconnected'
                ? ' · Соединение прервано'
                : ' · Подключение…';

    return (
        <div className="video-tile">
            {shouldShowVideo && (
                <video
                    ref={videoRef}
                    data-self={isSelf ? 'true' : 'false'}
                    autoPlay
                    playsInline
                    muted={isSelf || !audioEnabled}
                />
            )}

            {!shouldShowVideo && (
                <div className="video-placeholder">
                    {name}
                    {!isSelf && stateLabel}
                </div>
            )}

            {playBlocked && !isSelf && shouldShowVideo && (
                <div className="video-play-hint">
                    Нажмите «Разрешить звук участников» для воспроизведения.
                </div>
            )}

            <div className="video-tile-name">
                {name}
                {isSelf && ' (Вы)'}{' '}
                {microphoneEnabled && (
                    <span className="microphone-off" title="Микрофон включен">
                        🎙️
                    </span>
                )}
                {shouldShowVideo && (
                    <span className="camera-off" title="Камера включена">
                        📷
                    </span>
                )}
                {stateLabel}
            </div>
        </div>
    );
}

export default VideoTile;

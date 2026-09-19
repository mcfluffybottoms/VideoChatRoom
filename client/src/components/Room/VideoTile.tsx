import { useEffect, useRef, useState } from 'react';

type VideoTileProps = {
    name: string;
    isSelf?: boolean;
    stream?: MediaStream | null;
    microphoneEnabled?: boolean;
    connectionState?: string;
    audioEnabled?: boolean;
};

function VideoTile({
    name,
    isSelf = false,
    stream = null,
    microphoneEnabled = true,
    connectionState = 'connected',
    audioEnabled = false,
}: VideoTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playBlocked, setPlayBlocked] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.muted = isSelf || !audioEnabled;
        if (stream)
            void video
                .play()
                .then(() => setPlayBlocked(false))
                .catch(() => setPlayBlocked(true));
        return () => {
            if (video.srcObject === stream) video.srcObject = null;
        };
    }, [stream, isSelf, audioEnabled]);

    const hasVideo = !!stream
        ?.getVideoTracks()
        .some((track) => track.readyState === 'live' && track.enabled);

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
            {stream && hasVideo && (
                <video
                    ref={videoRef}
                    data-self={isSelf ? 'true' : 'false'}
                    autoPlay
                    playsInline
                    muted={isSelf || !audioEnabled}
                />
            )}
            {!hasVideo && (
                <div className="video-placeholder">
                    {name}
                    {!isSelf && stateLabel}
                </div>
            )}
            {playBlocked && !isSelf && (
                <div className="video-play-hint">
                    Нажмите «Разрешить звук участников» для воспроизведения.
                </div>
            )}
            <div className="video-tile-name">
                {name}
                {isSelf && ' (Вы)'}{' '}
                {!microphoneEnabled && isSelf && ' · Микрофон выключен'}
                {stateLabel}
            </div>
        </div>
    );
}
export default VideoTile;

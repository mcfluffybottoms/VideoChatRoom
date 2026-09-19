import { useEffect, useRef, useState } from 'react';

type VideoTileProps = {
    peerId: string;
    name: string;
    isSelf?: boolean;
    stream?: MediaStream | null;

    /**
     * Для self-тайла: включена ли локальная камера.
     * Для remote-тайлов не используется.
     */
    cameraEnabled?: boolean;

    /**
     * Для self-тайла: включён ли локальный микрофон.
     * Для remote-тайлов не используется.
     */
    microphoneEnabled?: boolean;

    /**
     * Состояние медиа удалённого пира.
     *
     * undefined — ещё не знаем (нет соединения или не пришло media_state).
     * false     — пир явно выключил.
     * true      — пир явно включил.
     *
     * Только для remote-тайлов.
     */
    remoteAudioAvailable?: boolean;
    remoteVideoAvailable?: boolean;

    /**
     * Разблокировал ли локальный пользователь воспроизведение
     * удалённого звука. Только для remote-тайлов.
     */
    audioEnabled?: boolean;

    connectionState?: string;

    registerVideoElement?: (
        peerId: string,
        el: HTMLVideoElement | null,
    ) => void;
};

function VideoTile({
    peerId,
    name,
    isSelf = false,
    stream = null,
    cameraEnabled = true,
    microphoneEnabled = true,
    remoteAudioAvailable,
    remoteVideoAvailable,
    audioEnabled = false,
    connectionState = 'connecting',
    registerVideoElement,
}: VideoTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playBlocked, setPlayBlocked] = useState(false);

    // Принудительный ре-рендер при изменении треков на месте
    // (mute/unmute/ended/addtrack/removetrack без нового MediaStream).
    const [, forceRender] = useState(0);

    useEffect(() => {
        if (!stream) {
            return;
        }
        const rerender = () => forceRender((n) => n + 1);

        stream.addEventListener('addtrack', rerender);
        stream.addEventListener('removetrack', rerender);

        const tracks = stream.getTracks();
        tracks.forEach((track) => {
            track.addEventListener('mute', rerender);
            track.addEventListener('unmute', rerender);
            track.addEventListener('ended', rerender);
        });

        return () => {
            stream.removeEventListener('addtrack', rerender);
            stream.removeEventListener('removetrack', rerender);
            tracks.forEach((track) => {
                track.removeEventListener('mute', rerender);
                track.removeEventListener('unmute', rerender);
                track.removeEventListener('ended', rerender);
            });
        };
    }, [stream]);

    const hasLiveVideo =
        !!stream &&
        stream
            .getVideoTracks()
            .some((t) => t.readyState === 'live' && t.enabled);

    // Видео показываем, если трек живой и мы не знаем точно,
    // что камера выключена.
    const shouldShowVideo = isSelf
        ? hasLiveVideo && cameraEnabled
        : hasLiveVideo && remoteVideoAvailable !== false;

    // 🚫 только при явном false. undefined = «неизвестно», не показываем.
    const shouldShowCameraOff = isSelf
        ? !cameraEnabled
        : remoteVideoAvailable === false;

    // 🔇 только при явном false.
    const shouldShowMicrophoneOff = isSelf
        ? !microphoneEnabled
        : remoteAudioAvailable === false;

    // Метка состояния — только когда удалённого потока нет вообще.
    const hasRemoteStream = !isSelf && Boolean(stream);
    const stateLabel =
        !isSelf && !hasRemoteStream
            ? connectionState === 'connected'
                ? ''
                : connectionState === 'failed'
                  ? ' · Нет соединения'
                  : connectionState === 'disconnected'
                    ? ' · Соединение прервано'
                    : ' · Подключение…'
            : '';

    // Регистрация video-элемента для remote-тайлов.
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

    // Прикрепление MediaStream и запуск воспроизведения.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        if (video.srcObject !== stream) {
            video.srcObject = stream;
        }

        if (!stream) {
            return;
        }

        video.autoplay = true;
        video.playsInline = true;

        // Muted autoplay разрешён браузером.
        if (!isSelf) {
            video.muted = true;
        }

        void video
            .play()
            .then(() => setPlayBlocked(false))
            .catch(() => setPlayBlocked(true));

        return () => {
            // Треки не останавливаем — MediaStream принадлежит WebRTC.
            if (video.srcObject === stream) {
                video.srcObject = null;
            }
        };
    }, [stream, isSelf]);

    // Разблокировка/блокировка удалённого звука.
    // Не трогает srcObject и не влияет на видимость видео.
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !stream || isSelf) {
            return;
        }

        if (!audioEnabled) {
            video.muted = true;
            if (video.paused) {
                void video.play().catch(() => setPlayBlocked(true));
            }
            return;
        }

        video.muted = false;
        void video
            .play()
            .then(() => setPlayBlocked(false))
            .catch(() => setPlayBlocked(true));
    }, [stream, audioEnabled, isSelf]);

    return (
        <div className="video-tile">
            <video
                ref={videoRef}
                data-self={isSelf ? 'true' : 'false'}
                data-peer-id={peerId}
                autoPlay
                playsInline
                // Для self всегда muted. Для remote состояние muted
                // управляется императивно эффектом выше.
                muted={isSelf ? true : undefined}
                style={{ display: shouldShowVideo ? 'block' : 'none' }}
            />

            {!shouldShowVideo && (
                <div className="video-placeholder">
                    <div className="video-placeholder-avatar">
                        {name.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>{name}</div>
                </div>
            )}

            {playBlocked && !isSelf && (
                <div className="video-play-hint">
                    Нажмите «Разрешить звук участников», чтобы слышать
                    собеседников.
                </div>
            )}

            <div className="video-tile-name">
                {name} {isSelf && ' (Вы)'}
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
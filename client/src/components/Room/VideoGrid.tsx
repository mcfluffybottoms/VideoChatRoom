import { useEffect, useState } from 'react';
import { Participant } from '../../commons/dto';
import { socket } from '../../config/socket';
import VideoTile from './VideoTile';

type VideoGridProps = {
    participants: Participant[];
    selfId: string;
    localStream?: MediaStream | null;
    remoteStreams?: Record<string, MediaStream>;
    peerStates?: Record<string, string>;
    microphoneEnabled?: boolean;
    audioUnlocked?: boolean;
    cameraEnabled?: boolean;
    registerVideoElement?: (peerId: string, el: HTMLVideoElement | null) => void;
};

type RemoteMediaState = {
    audio: boolean | undefined;
    video: boolean | undefined;
};

// undefined = «неизвестно». Не false, иначе тайл покажет 🚫
// до первого media_state.
const DEFAULT_REMOTE_MEDIA: RemoteMediaState = {
    audio: undefined,
    video: undefined,
};

function VideoGrid({
    participants,
    selfId,
    localStream = null,
    remoteStreams = {},
    peerStates = {},
    microphoneEnabled = true,
    cameraEnabled = true,
    audioUnlocked = false,
    registerVideoElement,
}: VideoGridProps) {
    const self = selfId
        ? participants.find((participant) => participant.id === selfId)
        : undefined;

    const others = selfId
        ? participants.filter((participant) => participant.id !== selfId)
        : [];

    const [remoteMedia, setRemoteMedia] = useState<
        Record<string, RemoteMediaState>
    >({});

    useEffect(() => {
        const handleMediaState = ({
            from,
            videoEnabled,
            audioEnabled,
        }: {
            from: string;
            videoEnabled?: boolean;
            audioEnabled?: boolean;
        }) => {
            setRemoteMedia((current) => {
                const prev = current[from] ?? DEFAULT_REMOTE_MEDIA;
                const next: RemoteMediaState = {
                    audio: audioEnabled ?? prev.audio,
                    video: videoEnabled ?? prev.video,
                };
                if (prev.audio === next.audio && prev.video === next.video) {
                    return current;
                }
                return { ...current, [from]: next };
            });
            
            // Удаляем записи ушедших участников.
            const activeIds = new Set(participants.map((p) => p.id));
            setRemoteMedia((current) => {
                const next: Record<string, RemoteMediaState> = {};
                let changed = false;
                for (const [id, value] of Object.entries(current)) {
                    if (activeIds.has(id)) {
                        next[id] = value;
                    } else {
                        changed = true;
                    }
                }
                return changed ? next : current;
            });
        };

        socket.on('webrtc:media_state', handleMediaState);

        // Запрос текущего состояния у сервера — на случай, если
        // кто-то отправил media_state до монтирования компонента.
        socket.emit('webrtc:request_media_state');

        return () => {
            socket.off('webrtc:media_state', handleMediaState);
        };
    }, []);

    return (
        <div className="video-area">
            <div className={`video-grid video-grid-${others.length}`}>
                {others.map((participant) => {
                    const media =
                        remoteMedia[participant.id] ?? DEFAULT_REMOTE_MEDIA;

                    return (
                        <VideoTile
                            key={participant.id}
                            peerId={participant.id}
                            name={participant.name}
                            stream={remoteStreams[participant.id] ?? null}
                            connectionState={
                                peerStates[participant.id] ?? 'connecting'
                            }
                            audioEnabled={audioUnlocked}
                            remoteAudioAvailable={media.audio}
                            remoteVideoAvailable={media.video}
                            registerVideoElement={registerVideoElement}
                        />
                    );
                })}
            </div>

            {self && (
                <div className="self-view">
                    <VideoTile
                        peerId={self.id}
                        name={self.name}
                        isSelf
                        stream={localStream}
                        cameraEnabled={cameraEnabled}
                        microphoneEnabled={microphoneEnabled}
                    />
                </div>
            )}
        </div>
    );
}

export default VideoGrid;
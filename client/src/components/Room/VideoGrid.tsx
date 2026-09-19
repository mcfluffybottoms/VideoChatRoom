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
    const self = participants.find((participant) => participant.id === selfId);
    const others = participants.filter(
        (participant) => participant.id !== selfId,
    );

    const [remoteVideoAvailable, setRemoteVideoAvailable] = useState<
        Record<string, boolean>
    >({});

    const [remoteAudioAvailable, setRemoteAudioAvailable] = useState<
        Record<string, boolean>
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
            if (videoEnabled !== undefined) {
                setRemoteVideoAvailable((current) => ({
                    ...current,
                    [from]: videoEnabled,
                }));
            }

            if (audioEnabled !== undefined) {
                setRemoteAudioAvailable((current) => ({
                    ...current,
                    [from]: audioEnabled,
                }));
            }
        };

        socket.on('webrtc:media_state', handleMediaState);
        return () => {
            socket.off('webrtc:media_state', handleMediaState);
        };
    }, []);

    // Drop availability entries for participants who left.
    useEffect(() => {
        const activeIds = new Set(participants.map((p) => p.id));

        setRemoteVideoAvailable((current) => {
            const next: Record<string, boolean> = {};
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

        setRemoteAudioAvailable((current) => {
            const next: Record<string, boolean> = {};
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
    }, [participants]);

    return (
        <div className="video-area">
            <div className={`video-grid video-grid-${others.length}`}>
                {others.map((participant) => {
                    const audioAvailable =
                        remoteAudioAvailable[participant.id] ?? true;

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
                            remoteAudioAvailable={audioAvailable}
                            remoteVideoAvailable={
                                remoteVideoAvailable[participant.id] ?? true
                            }
                            // For remote tiles, use the remote's reported
                            // audio state, not our local mic flag.
                            microphoneEnabled={audioAvailable}
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
                        microphoneEnabled={microphoneEnabled}
                        remoteVideoAvailable={cameraEnabled}
                    />
                </div>
            )}
        </div>
    );
}

export default VideoGrid;
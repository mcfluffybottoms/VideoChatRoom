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
};

function VideoGrid({
    participants,
    selfId,
    localStream = null,
    remoteStreams = {},
    peerStates = {},
    microphoneEnabled = true,
    audioUnlocked = false,
}: VideoGridProps) {
    const self = participants.find((participant) => participant.id === selfId);
    const others = participants.filter(
        (participant) => participant.id !== selfId,
    );

    // get if video is enabled
    const [remoteVideoAvailable, setRemoteVideoAvailable] = useState<
        Record<string, boolean>
    >({});

    const [remoteAudioAvailable, setRemoteAudioAvailable] = useState<
        Record<string, boolean>
    >({});
    // watch for media state changes from other participants
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

    return (
        <div className="video-area">
            <div className={`video-grid video-grid-${others.length}`}>
                {others.map((participant) => (
                    <VideoTile
                        key={participant.id}
                        name={participant.name}
                        stream={remoteStreams[participant.id] ?? null}
                        connectionState={
                            peerStates[participant.id] ?? 'connecting'
                        }
                        audioEnabled={audioUnlocked}
                        remoteAudioAvailable={
                            remoteAudioAvailable[participant.id] ?? true
                        }
                        remoteVideoAvailable={
                            remoteVideoAvailable[participant.id] ?? true
                        }
                        microphoneEnabled={
                            remoteVideoAvailable[participant.id] ?? true
                        }
                    />
                ))}
            </div>
            {self && (
                <div className="self-view">
                    <VideoTile
                        name={self.name}
                        isSelf
                        stream={localStream}
                        microphoneEnabled={microphoneEnabled}
                    />
                </div>
            )}
        </div>
    );
}
export default VideoGrid;

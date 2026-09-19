import { Participant } from '../../commons/dto';
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

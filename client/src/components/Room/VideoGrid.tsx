import { Participant } from '../../commons/Dto';
import VideoTile from './VideoTile';

type VideoGridProps = {
    participants: Participant[];
    selfId: string;
};

function VideoGrid({
    participants,
    selfId,
}: VideoGridProps) {
    const self = participants.find(
        participant => participant.id === selfId,
    );

    console.log(selfId)
    const otherParticipants = participants.filter(
        participant => participant.id !== selfId,
    );

    return (
        <div className="video-area">
            <div className={`video-grid video-grid-${otherParticipants.length}`}>
                {participants.filter(participant => participant.id != selfId).map(participant => (
                    <VideoTile
                        key={participant.id}
                        name={participant.name}
                    />
                ))}
            </div>

            {self && (
                <div className="self-view">
                    <VideoTile
                        name={self.name}
                        isSelf
                    />
                </div>
            )}
        </div>
    );
}

export default VideoGrid;
import { HistoryStatus, RoomHistoryEntry } from '../../commons/dto';

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatHistoryStatus(status: HistoryStatus): string {
    switch (status) {
        case HistoryStatus.ACCEPTED:
            return 'joined the room';
        case HistoryStatus.LEFT:
            return 'left the room';
        case HistoryStatus.ROOM_FULL:
            return 'could not join because the room is full';
        case HistoryStatus.ALREADY_JOINED:
            return 'is already in the room';
        case HistoryStatus.NONE_EXIST:
            return 'was not in the room';
    }
}

type MessageProps = {
    entry: RoomHistoryEntry;
};

function Message({ entry }: MessageProps) {
    const participantName = entry.participantName ?? 'Unknown user';

    if (entry.type === 'system') {
        return (
            <div className="systemmessage">
                <strong></strong> {participantName}{' '}
                {formatHistoryStatus(entry.status)}
                <time>{formatTime(entry.timestamp)}</time>
            </div>
        );
    }

    return (
        <div className="message">
            <strong>{entry.participantName}</strong>
            <span>{entry.text}</span>
            <time>{formatTime(entry.timestamp)}</time>
        </div>
    );
}

export default Message;

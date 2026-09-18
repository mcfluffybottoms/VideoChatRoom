type VideoTileProps = {
    name: string;
    isSelf?: boolean;
};

function VideoTile({ name, isSelf = false }: VideoTileProps) {
    return (
        <div className="video-tile">
            <div className="video-placeholder">{isSelf ? 'You' : name}</div>

            <div className="video-tile-name">
                {name}
                {isSelf && ' (You)'}
            </div>
        </div>
    );
}

export default VideoTile;

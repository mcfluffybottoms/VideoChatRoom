export function isWebRTCSupported(): boolean {
    return (
        'mediaDevices' in navigator &&
        typeof navigator.mediaDevices?.getUserMedia === 'function'
    );
}

export const RTC_CONFIGURATION: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

export function isWebRTCSupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.RTCPeerConnection === 'function' &&
        !!navigator.mediaDevices?.getUserMedia
    );
}
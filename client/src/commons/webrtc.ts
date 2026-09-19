export const RTC_CONFIGURATION: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun2.1.google.com:19302" }],
};

export function isWebRTCSupported(): boolean {
    return typeof window !== 'undefined' &&
        'RTCPeerConnection' in window &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function';
}

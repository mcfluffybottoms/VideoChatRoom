import { useEffect, useState } from 'react';

export function useMediaDevices() {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let currentStream: MediaStream | null = null;

        async function requestMedia() {
            if (!navigator.mediaDevices?.getUserMedia) {
                return;
            }

            try {
                currentStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });

                setStream(currentStream);
            } catch {
                setError(
                    'Не удалось получить доступ к камере или микрофону. Вы можете продолжить без них.',
                );
            }
        }

        requestMedia();

        return () => {
            currentStream?.getTracks().forEach(track => track.stop());
        };
    }, []);

    return {
        stream,
        error,
    };
}
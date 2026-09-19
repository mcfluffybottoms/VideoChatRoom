import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { MAX_NAME_LENGTH, validateName } from '../../commons/name-validation';
import { NameValidationResult } from '../../commons/name-validation';

type EnterRoomFormProps = {
    onEnter: (name: string) => void;
};

function EnterRoomForm({ onEnter }: EnterRoomFormProps) {
    const { roomId } = useParams();

    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const [isCheckingRoom, setIsCheckingRoom] = useState(true);
    const [roomExists, setRoomExists] = useState(false);
    
    useEffect(() => {
        async function checkRoom() {
            if (!roomId) {
                setRoomExists(false);
                setIsCheckingRoom(false);
                return;
            }
            try {
                const response = await fetch(`/api/room/${roomId}`);
                setRoomExists(response.ok);
            } catch {
                setRoomExists(false);
            } finally {
                setIsCheckingRoom(false);
            }
        }
        checkRoom();
    }, [roomId]);


    const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();

        setError('');
        if (!roomExists) {
            setError('Такой комнаты нет.');
            return;
        }

        // name validation
        const result = validateName(name);
        switch (result[0]) {
            case NameValidationResult.Empty:
                setError(`Поле не может быть пустым.`);
                return;
            case NameValidationResult.TooLong:
                setError(
                    `Имя может содержать только до ${MAX_NAME_LENGTH} символов.`,
                );
                return;
            case NameValidationResult.Valid:
        }

        //sessionStorage.setItem(`roomName:${roomId}`, result[1]);
        onEnter(result[1]);

        navigate(`/room/${roomId}`);
    };

    if (isCheckingRoom) {
        return <div>Проверка комнаты...</div>;
    }

    if (!roomExists) {
        return (
            <div role="alert">
                Такой комнаты нет.
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit}>
            <input
                value={name}
                onChange={(event) => setName(event.target.value)}
            />

            {error && <div>{error}</div>}

            <button type="submit">Зайти в комнату</button>
        </form>
    );
}
export default EnterRoomForm;

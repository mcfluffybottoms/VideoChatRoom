import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { MAX_NAME_LENGTH, validateName } from '../../utils/nameValidation';
import { NameValidationResult } from '../../utils/nameValidation';

type EnterRoomFormProps = {
    onEnter: (name: string) => void;
};

function EnterRoomForm({ onEnter }: EnterRoomFormProps) {
    const { roomId } = useParams();

    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();

        // name validation
        const result = validateName(name);
        switch (result[0]) {
            case NameValidationResult.Empty:
                setError(`Name cannot be empty.`);
                return;
            case NameValidationResult.TooLong:
                setError(
                    `Name is too long. Must contain ${MAX_NAME_LENGTH} characters.`,
                );
                return;
            case NameValidationResult.Valid:
        }

        // get room
        if (!roomId) {
            setError('Room does not exist.');
            return;
        }
        const response = await fetch(`/api/room/${roomId}`);

        if (!response.ok) {
            setError(`Room does not exist.`);
            return;
        }

        sessionStorage.setItem(`roomName:${roomId}`, result[1]);
        onEnter(result[1]);

        navigate(`/room/${roomId}`);
    };

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
export default EnterRoomForm
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { MAX_NAME_LENGTH, validateName } from '../../commons/nameValidation';
import { NameValidationResult } from '../../commons/nameValidation';

export default function StartScreenForm() {
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

        // create room
        const response = await fetch('/api/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: name.trim() }),
        });

        if (!response.ok) {
            setError(`Faield to create a room.`);
            return;
        }

        const { roomId } = await response.json();
        sessionStorage.setItem(`roomName:${roomId}`, result[1]);

        navigate(`/room/${roomId}`);
    };

    return (
        <form onSubmit={handleSubmit}>
            <input
                value={name}
                onChange={(event) => setName(event.target.value)}
            />

            {error && <div>{error}</div>}

            <button type="submit">Создать комнату</button>
        </form>
    );
}

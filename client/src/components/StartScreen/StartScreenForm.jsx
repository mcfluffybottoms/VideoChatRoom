import { useState } from 'react';

import { MAX_NAME_LENGTH, validateName } from '../../utils/nameValidation';
import { NameValidationResult } from '../../utils/nameValidation';

export default function StartScreenForm() {
    const [name, setName] = useState('')
    const [error, setError] = useState('')

    const handleSubmit = async (event) => {
        event.preventDefault()

        // name validation
        const result = validateName(name);
        switch (result[0]) {
            case NameValidationResult.Empty:
                setError(`Name cannot be empty.`)
                return;
            case NameValidationResult.TooLong:
                setError(`Name is too long. Must contain ${MAX_NAME_LENGTH} characters.`);
                return;
            case NameValidationResult.Valid:
        }

        // create room
        const response = await fetch('/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: name.trim() }),
        });

        if(!response.ok) {
            setError(`Faield to create a room.`);
            return;
        }

        const { roomId } = await response.json()

        window.location.href = `/room/${roomId}`
    }

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
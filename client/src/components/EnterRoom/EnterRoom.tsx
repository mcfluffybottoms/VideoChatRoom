import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import EnterRoomForm from './EnterRoomForm';
import Room from '../Room/Room';

export default function EnterRoom() {
    const { roomId } = useParams();
    const location = useLocation();

    const initialName = location.state?.name ?? '';
    const [name, setName] = useState(initialName);

    if (!roomId) {
        return null;
    }

    if (!name) {
        return (
            <>
                <h1>Войти в видеозвонок!</h1>

                <EnterRoomForm onEnter={setName} />
            </>
        );
    }

    return <Room name={name} />;
}
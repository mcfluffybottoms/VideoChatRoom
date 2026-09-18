import { useState } from 'react';
import EnterRoomForm from './EnterRoomForm';
import Room from '../Room/Room';
import { useParams } from 'react-router-dom';

export default function EnterRoom() {
    const { roomId } = useParams();

    const [name, setName] = useState(
        roomId
            ? sessionStorage.getItem(`roomName:${roomId}`) ?? ''
            : '',
    );

    if (!name) {
        return (
            <>
                <h1>Войти в видеозвонок!</h1>
                <EnterRoomForm onEnter={setName} />
            </>
        );
    }

    return <Room />;
}
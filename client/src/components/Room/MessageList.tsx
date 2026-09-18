import { useEffect, useRef } from 'react';
import './Room.css';
import Message from './Message';
import { RoomHistoryEntry } from '../../commons/Dto';

type MessagesProps = {
    messages: RoomHistoryEntry[];
};

function MessageList({ messages }: MessagesProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: 'smooth',
        });
    }, [messages]);

    return (
        <section className="messages-container">
            <h2>Messages</h2>

            <div className="messages">
                {messages.map((entry) => (
                    <Message key={entry.id} entry={entry} />
                ))}
                <div ref={messagesEndRef} />
            </div>
        </section>
    );
}

export default MessageList;

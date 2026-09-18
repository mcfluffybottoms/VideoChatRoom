export type Participant = {
    id: string;
    name: string;
};

export function createParticipant(id: string, name: string): Participant {
    return { id, name };
}

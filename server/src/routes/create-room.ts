import { type Request, type Response } from 'express';

type CreateUserSuccess = {
  roomId: string;
};
type CreateUserFail = {
  error: string
};

type CreateUserResponse = CreateUserSuccess | CreateUserFail

function generateRoomId(): string {
  return crypto.randomUUID();
}

export function createRoom(request: Request, response: Response) {
  const { name } = request.body;
  const roomId = generateRoomId();
    response.status(201).json({
        roomId,
    });
}
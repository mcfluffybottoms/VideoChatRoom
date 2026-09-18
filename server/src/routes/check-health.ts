import { type Request, type Response } from 'express';

export function health(request: Request, response: Response) {
    response.json({ status: 'ok' });
}

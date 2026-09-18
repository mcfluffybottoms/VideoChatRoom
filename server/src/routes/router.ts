import { Router } from 'express';
import { createRoom } from './create-room.ts';
import { health } from './check-health.ts';

const router = Router();

router.post('/room', createRoom);
router.get('/health', health);

export default router;

import { Router } from 'express';
import { createRoom, getRoomById } from './create-get-room';
import { health } from './check-health';

const router = Router();

router.post('/api/room', createRoom);
router.get('/api/room/:roomId', getRoomById);
router.get('/api/health', health);

export default router;

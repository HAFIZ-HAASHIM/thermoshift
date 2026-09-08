import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import scheduleRoutes from './routes/scheduleRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'ThermoShift API Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/schedules', scheduleRoutes);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[ThermoShift Backend] Server listening on port ${PORT}`);
  });
}

export default app;

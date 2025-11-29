import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDB } from './config/database.js';
import creatorRoutes from './routes/creators.js';
import tipRoutes from './routes/tips.js';
import xrplRoutes from './routes/xrpl.js';
import authRoutes from './routes/auth.js';
import xrplService from './services/xrplService.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Initialize XRPL Service
xrplService.initialize().catch(err => {
  console.error('⚠️  XRPL Service failed to initialize:', err.message);
  console.log('⚡ Server will continue without XRPL features');
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'xrpTip API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/creators', creatorRoutes);
app.use('/api/tips', tipRoutes);
app.use('/api/xrpl', xrplRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
    🚀 Server is running!
    🌍 Environment: ${process.env.NODE_ENV || 'development'}
    📡 Port: ${PORT}
    🔗 API URL: http://localhost:${PORT}
    💎 XRP Tip Backend Ready!
  `);
});

export default app;
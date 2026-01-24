require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const passport = require('./config/passport');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'airline-control-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible to routes and globally for services
app.set('io', io);
global.io = io;

// Import middleware
const { requireAuth, redirectIfAuth } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const worldRoutes = require('./routes/world');
const worldSelectionRoutes = require('./routes/worldSelection');
const adminRoutes = require('./routes/admin');

// Import services
const worldTimeService = require('./services/worldTimeService');

// Auth routes
app.use('/auth', authRoutes);

// API routes
app.use('/api/world', worldRoutes);
app.use('/api/worlds', worldSelectionRoutes);
app.use('/api/admin', requireAuth, adminRoutes);

// Page routes
app.get('/', redirectIfAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/world-selection', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/world-selection.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// API routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes (to be implemented)
// app.use('/api/flights', require('./routes/flights'));
// app.use('/api/aircraft', require('./routes/aircraft'));
// app.use('/api/airlines', require('./routes/airlines'));
// app.use('/api/vatsim', require('./routes/vatsim'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
server.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════╗
║     Airline Control Server v1.0.0      ║
╠════════════════════════════════════════╣
║  Server running on port ${PORT}           ║
║  Environment: ${process.env.NODE_ENV || 'development'}              ║
║  WebSocket: enabled                    ║
╚════════════════════════════════════════╝
  `);

  // Start world time service
  const worldStarted = await worldTimeService.start();
  if (!worldStarted) {
    console.log('\n💡 Tip: Create a world with "npm run world:create"\n');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  worldTimeService.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
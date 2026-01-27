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

// Only use morgan logger in development mode
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    skip: () => true // Skip logging in production
  }));
}

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

// Serve static files with cache control
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, path) => {
    // Disable caching for JS files to prevent stale code issues
    if (path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Only log in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('Client connected:', socket.id);
  }

  socket.on('disconnect', () => {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Client disconnected:', socket.id);
    }
  });
});

// Make io accessible to routes and globally for services
app.set('io', io);
global.io = io;

// Import middleware
const { requireAuth, redirectIfAuth, requireWorld } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const worldRoutes = require('./routes/world');
const worldSelectionRoutes = require('./routes/worldSelection');
const adminRoutes = require('./routes/admin');
const aircraftRoutes = require('./routes/aircraft');
const fleetRoutes = require('./routes/fleet');
const financesRoutes = require('./routes/finances');
const routesRoutes = require('./routes/routes');
const schedulingRoutes = require('./routes/scheduling');
const pricingRoutes = require('./routes/pricing');

// Import services
const worldTimeService = require('./services/worldTimeService');

// Helper function to render pages with base layout
async function renderPage(pagePath) {
  const fs = require('fs').promises;

  try {
    const [layoutHtml, pageHtml] = await Promise.all([
      fs.readFile(path.join(__dirname, '../public/base-layout.html'), 'utf8'),
      fs.readFile(pagePath, 'utf8')
    ]);

    // Extract metadata from HTML comments
    const titleMatch = pageHtml.match(/<!--\s*TITLE:\s*(.+?)\s*-->/);
    const subtitleMatch = pageHtml.match(/<!--\s*SUBTITLE:\s*(.+?)\s*-->/);
    const scriptsMatch = pageHtml.match(/<!--\s*SCRIPTS:\s*(.+?)\s*-->/);

    let result = layoutHtml;

    // Replace title if specified
    if (titleMatch) {
      result = result.replace(/<title[^>]*>.*?<\/title>/, `<title>${titleMatch[1]}</title>`);
    }

    // Replace subtitle if specified
    if (subtitleMatch) {
      result = result.replace(
        /<span class="brand-subtitle"[^>]*>.*?<\/span>/,
        `<span class="brand-subtitle" id="pageSubtitle">${subtitleMatch[1]}</span>`
      );
    }

    // Inject page content
    result = result.replace(
      /<div id="pageContent">[\s\S]*?<\/div>\s*<script/,
      `<div id="pageContent">\n${pageHtml}\n  </div>\n\n  <script`
    );

    // Add additional scripts before closing body tag if specified
    if (scriptsMatch) {
      const scripts = scriptsMatch[1].split(',').map(s => s.trim());
      const scriptTags = scripts.map(src => `  <script src="${src}"></script>`).join('\n');
      // Replace the LAST occurrence of </body> to ensure we add scripts to the actual body closing tag
      const lastBodyIndex = result.lastIndexOf('</body>');
      if (lastBodyIndex !== -1) {
        result = result.substring(0, lastBodyIndex) + scriptTags + '\n' + result.substring(lastBodyIndex);
      }
    }

    return result;
  } catch (error) {
    console.error('Error rendering page:', error);
    throw error;
  }
}

// Auth routes
app.use('/auth', authRoutes);

// API routes
app.use('/api/world', worldRoutes);
app.use('/api/worlds', worldSelectionRoutes);
app.use('/api/aircraft', aircraftRoutes);
app.use('/api/fleet', requireWorld, fleetRoutes);
app.use('/api/finances', requireWorld, financesRoutes);
app.use('/api/routes', requireWorld, routesRoutes);
app.use('/api/schedule', requireWorld, schedulingRoutes);
app.use('/api/pricing', requireWorld, pricingRoutes);
app.use('/api/admin', requireAuth, adminRoutes);

// Page routes
app.get('/', redirectIfAuth, (req, res) => {
  // For the login page, we'll serve it normally since it has a different structure
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/world-selection', requireAuth, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/world-selection.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/dashboard', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/dashboard.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/admin.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/aircraft-marketplace', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/aircraft-marketplace.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/fleet', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/fleet.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/finances', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/finances.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/routes', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/routes.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/routes/create', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/routes-create.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/scheduling', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/scheduling.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/pricing', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/pricing.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/routes/edit', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/routes-edit.html'));
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
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
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  } else {
    // In production, only log to file or external service if needed
    console.error('Server Error:', err.message);
  }
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
server.listen(PORT, async () => {
  // Only show detailed startup message in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`
╔════════════════════════════════════════╗
║     Airline Control Server v1.0.0      ║
╠════════════════════════════════════════╣
║  Server running on port ${PORT}           ║
║  Environment: ${process.env.NODE_ENV || 'development'}              ║
║  WebSocket: enabled                    ║
╚════════════════════════════════════════╝
  `);
  } else {
    console.log(`Server running on port ${PORT}`);
  }

  // Start world time service for all active worlds
  const worldStarted = await worldTimeService.startAll();
  if (!worldStarted && process.env.NODE_ENV === 'development') {
    console.log('\n💡 Tip: Create a world with "npm run world:create"\n');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  worldTimeService.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
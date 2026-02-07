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
    methods: ['GET', 'POST'],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Allow Socket.IO v3 clients (backwards compatibility)
  path: '/socket.io/',
  pingTimeout: 60000,
  pingInterval: 25000
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

// Socket.IO connection handling with verbose logging
io.on('connection', (socket) => {
  // Only log in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('\n[Socket.IO] ✓ Client connected:', socket.id);
    console.log('[Socket.IO] Transport:', socket.conn.transport.name);
    console.log('[Socket.IO] Client IP:', socket.handshake.address);
  }

  // Log transport upgrades
  socket.conn.on('upgrade', (transport) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Socket.IO] Transport upgraded to:', transport.name);
    }
  });

  socket.on('disconnect', (reason) => {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('[Socket.IO] ✗ Client disconnected:', socket.id, '- Reason:', reason);
    }
  });

  socket.on('error', (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Socket.IO] Socket error:', error);
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
const contactRoutes = require('./routes/contact');
const dashboardRoutes = require('./routes/dashboard');

// Import services
const worldTimeService = require('./services/worldTimeService');

// Helper function to render pages with base layout
async function renderPage(pagePath, requestPath) {
  const fs = require('fs').promises;

  try {
    // Determine which sidebar to use based on the request path
    // Use simplified sidebar for admin, world selection, and public pages
    const simplifiedSidebarPages = ['/admin', '/world-selection', '/contact', '/faqs', '/credits'];
    const sidebarPath = simplifiedSidebarPages.includes(requestPath)
      ? path.join(__dirname, '../public/partials/sidebar-admin.html')
      : path.join(__dirname, '../public/partials/sidebar.html');

    const [layoutHtml, pageHtml, sidebarHtml] = await Promise.all([
      fs.readFile(path.join(__dirname, '../public/base-layout.html'), 'utf8'),
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(sidebarPath, 'utf8')
    ]);

    // Extract metadata from HTML comments
    const titleMatch = pageHtml.match(/<!--\s*TITLE:\s*(.+?)\s*-->/);
    const subtitleMatch = pageHtml.match(/<!--\s*SUBTITLE:\s*(.+?)\s*-->/);
    const scriptsMatch = pageHtml.match(/<!--\s*SCRIPTS:\s*(.+?)\s*-->/);
    const stylesMatch = pageHtml.match(/<!--\s*STYLES:\s*(.+?)\s*-->/);

    // Set active class on the correct nav item based on current path
    let processedSidebar = sidebarHtml;

    // Add active class to nav items - check exact path first, then parent for submenu expansion
    const addActiveClass = (sidebar, checkPath) => {
      // Match data-path that exactly matches or is in a comma-separated list
      // This regex ensures we match exact paths, not substrings (e.g., /routes shouldn't match /routes/create)
      const escapedPath = checkPath.replace(/\//g, '\\/');
      // Match: data-path="/path" OR data-path="/path,..." OR data-path="...,/path" OR data-path="...,/path,..."
      const dataPathRegex = new RegExp(`(<li class="nav-item[^"]*"[^>]*data-path="(?:${escapedPath}|${escapedPath},[^"]*|[^"]*,${escapedPath}|[^"]*,${escapedPath},[^"]*)")`, 'g');

      return sidebar.replace(dataPathRegex, (match) => {
        // Skip if already active
        if (match.includes('active')) return match;

        // Add active class
        if (match.includes('class="nav-item"')) {
          return match.replace('class="nav-item"', 'class="nav-item active"');
        } else if (match.includes('class="nav-item parent"')) {
          return match.replace('class="nav-item parent"', 'class="nav-item parent active"');
        }
        return match;
      });
    };

    // First, activate the exact path match
    processedSidebar = addActiveClass(processedSidebar, requestPath);

    // Then, activate parent menu for nested routes (e.g., /routes/create -> activate /routes parent)
    if (requestPath.includes('/')) {
      const parentPath = '/' + requestPath.split('/')[1];
      if (parentPath !== requestPath) {
        // Only activate parent items (for submenu expansion), not child items
        const escapedParent = parentPath.replace(/\//g, '\\/');
        const parentRegex = new RegExp(`(<li class="nav-item parent"[^>]*data-path="[^"]*${escapedParent}[^"]*")`, 'g');
        processedSidebar = processedSidebar.replace(parentRegex, (match) => {
          if (match.includes('active')) return match;
          return match.replace('class="nav-item parent"', 'class="nav-item parent active"');
        });
      }
    }

    let result = layoutHtml;

    // Replace title if specified
    if (titleMatch) {
      result = result.replace(/<title[^>]*>.*?<\/title>/, `<title>${titleMatch[1]}</title>`);
    }

    // Add additional stylesheets in head if specified
    if (stylesMatch) {
      const styles = stylesMatch[1].split(',').map(s => s.trim());
      const styleTags = styles.map(href => `  <link rel="stylesheet" href="${href}">`).join('\n');
      result = result.replace('</head>', `${styleTags}\n</head>`);
    }

    // Replace subtitle if specified
    if (subtitleMatch) {
      result = result.replace(
        /<span class="brand-subtitle"[^>]*>.*?<\/span>/,
        `<span class="brand-subtitle" id="pageSubtitle">${subtitleMatch[1]}</span>`
      );
    }

    // Hide world info container for simplified sidebar pages (prevents flash)
    if (simplifiedSidebarPages.includes(requestPath)) {
      result = result.replace(
        '<div class="nav-world-info" id="worldInfoContainer">',
        '<div class="nav-world-info" id="worldInfoContainer" style="display: none;">'
      );
    }

    // Process page content - inject sidebar into dashboard-container
    let processedPageHtml = pageHtml;

    // If the page has a dashboard-container, inject the sidebar after it opens
    if (pageHtml.includes('<div class="dashboard-container">')) {
      processedPageHtml = pageHtml.replace(
        '<div class="dashboard-container">',
        `<div class="dashboard-container">\n  ${processedSidebar}`
      );
    }

    // Inject page content
    result = result.replace(
      /<div id="pageContent">[\s\S]*?<\/div>\s*<script/,
      `<div id="pageContent">\n${processedPageHtml}\n  </div>\n\n  <script`
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
app.use('/api/contact', contactRoutes);
app.use('/api/dashboard', requireWorld, dashboardRoutes);

// Page routes
app.get('/', redirectIfAuth, (req, res) => {
  // For the login page, we'll serve it normally since it has a different structure
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/world-selection', requireAuth, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/world-selection.html'), '/world-selection');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/dashboard', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/dashboard.html'), '/dashboard');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/admin.html'), '/admin');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/credits', requireAuth, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/credits.html'), '/credits');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/aircraft-marketplace', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/aircraft-marketplace.html'), '/aircraft-marketplace');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/fleet', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/fleet.html'), '/fleet');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/maintenance', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/maintenance.html'), '/maintenance');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/finances', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/finances.html'), '/finances');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/world-map', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/world-map.html'), '/world-map');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/routes', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/routes.html'), '/routes');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/routes/create', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/routes-create.html'), '/routes/create');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/scheduling', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/scheduling.html'), '/scheduling');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/pricing', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/pricing.html'), '/pricing');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/routes/edit', requireWorld, async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/routes-edit.html'), '/routes/edit');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/contact', async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/contact.html'), '/contact');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

app.get('/faqs', async (req, res) => {
  try {
    const html = await renderPage(path.join(__dirname, '../public/faqs.html'), '/faqs');
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
process.on('SIGINT', async () => {
  console.log('\n\nShutting down gracefully...');
  await worldTimeService.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
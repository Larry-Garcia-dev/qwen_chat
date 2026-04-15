require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const qwenRoutes = require('./routes/qwen.routes');
const DatabaseService = require('./services/database.service');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// Configuración de CORS
// ==========================================
const corsOptions = {
    origin: function (origin, callback) {
        // Permitir requests sin origin (como Postman) y orígenes configurados
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:3002',
            process.env.FRONTEND_URL,
            process.env.PUBLIC_URL
        ].filter(Boolean);
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`[CORS] Origen bloqueado: ${origin}`);
            callback(null, true); // Permitir todos por ahora para desarrollo
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// ==========================================
// Middlewares básicos
// ==========================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// Archivos estáticos y uploads
// ==========================================

// Crear directorios de uploads si no existen
const uploadDirs = ['uploads', 'uploads/images', 'uploads/audio', 'uploads/video', 'uploads/documents', 'uploads/generated'];
uploadDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`[INIT] Directorio creado: ${fullPath}`);
    }
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Servir uploads con headers apropiados para CORS
app.use('/uploads', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirname, 'uploads')));

// ==========================================
// Logging Middleware
// ==========================================
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ${req.method} ${req.url}`);
    // Verificar que req.body existe y tiene contenido antes de loggearlo
    if (req.method === 'POST' && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        const bodyPreview = JSON.stringify(req.body).substring(0, 200);
        console.log(`[BODY] ${bodyPreview}${bodyPreview.length >= 200 ? '...' : ''}`);
    }
    if (req.file) {
        console.log(`[FILE] ${req.file.originalname} (${req.file.mimetype})`);
    }
    next();
});

// ==========================================
// Rutas de la API
// ==========================================
app.use('/api/qwen', qwenRoutes);

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        name: 'Qwen AI API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: 'GET /api/qwen/health',
            chat: 'POST /api/qwen/chat',
            generateImage: 'POST /api/qwen/generate-image',
            generateVideo: 'POST /api/qwen/generate-video',
            tts: 'POST /api/qwen/tts',
            audioStt: 'POST /api/qwen/audio-stt',
            multimodal: 'POST /api/qwen/multimodal'
        },
        uploads: '/uploads/*'
    });
});

// ==========================================
// Manejo de errores global
// ==========================================
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    console.error(err.stack);
    
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Error interno del servidor',
        timestamp: new Date().toISOString()
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Ruta no encontrada: ${req.method} ${req.url}`,
        availableEndpoints: [
            'GET /',
            'GET /api/qwen/health',
            'POST /api/qwen/chat',
            'POST /api/qwen/generate-image',
            'POST /api/qwen/generate-video',
            'POST /api/qwen/tts',
            'POST /api/qwen/audio-stt',
            'POST /api/qwen/multimodal'
        ]
    });
});

// ==========================================
// Iniciar servidor
// ==========================================
const startServer = async () => {
    // Intentar conectar a la base de datos
    try {
        await DatabaseService.initialize();
        console.log('[INIT] Base de datos MySQL conectada y tablas verificadas');
    } catch (dbError) {
        console.warn(`[INIT] Advertencia: No se pudo conectar a MySQL: ${dbError.message}`);
        console.warn('[INIT] El servidor continuará sin conexión a base de datos');
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log('\n========================================');
        console.log('   HDI CHAT - QWEN AI API SERVER');
        console.log('========================================');
        console.log(`Servidor corriendo en: http://localhost:${PORT}`);
        console.log(`PUBLIC_URL configurada: ${process.env.PUBLIC_URL || 'http://localhost:' + PORT}`);
        console.log(`Base de datos: ${DatabaseService.isDBConnected() ? 'Conectada' : 'No conectada'}`);
        console.log(`Uploads disponibles en: /uploads/*`);
        console.log('----------------------------------------');
        console.log('Endpoints disponibles:');
        console.log('  GET  /api/qwen/health      - Health check');
        console.log('  POST /api/qwen/chat        - Chat con IA');
        console.log('  POST /api/qwen/generate-image - Generar imagen');
        console.log('  POST /api/qwen/generate-video - Generar video');
        console.log('  POST /api/qwen/tts         - Texto a voz');
        console.log('  POST /api/qwen/audio-stt   - Audio a texto');
        console.log('  POST /api/qwen/multimodal  - Análisis visual');
        console.log('  POST /api/qwen/db/query    - Consulta BD (IA)');
        console.log('  POST /api/qwen/db/cotizar  - Cotizar seguro');
        console.log('========================================\n');
    });
};

startServer();

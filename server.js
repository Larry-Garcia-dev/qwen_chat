require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Configuraciones y Middlewares
const corsOptions = require('./config/cors.config');
const { requestLogger } = require('./middlewares/logger.middleware');
const { notFoundHandler, globalErrorHandler } = require('./middlewares/error.middleware');

// Rutas y Utilidades
const qwenRoutes = require('./routes/qwen.routes');
const { initializeUploadDirs } = require('./utils/api.util');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Inicializar sistema de carpetas
initializeUploadDirs();

// 2. Configuración base y Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestLogger);

// 3. Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirname, 'uploads')));

// 4. Rutas
app.get('/', (req, res) => {
    res.json({
        name: 'Qwen AI API',
        version: '1.0.0',
        status: 'running',
        endpoints: '/api/qwen/health'
    });
});
app.use('/api/qwen', qwenRoutes);

// 5. Manejo de Errores (Siempre al final)
app.use(notFoundHandler);
app.use(globalErrorHandler);

// 6. Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n========================================');
    console.log('   QWEN AI API SERVER');
    console.log('========================================');
    console.log(`Servidor corriendo en: http://localhost:${PORT}`);
    console.log(`PUBLIC_URL: ${process.env.PUBLIC_URL || 'http://localhost:' + PORT}`);
    console.log('========================================\n');
});
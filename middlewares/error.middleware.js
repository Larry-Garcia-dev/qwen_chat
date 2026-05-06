// Manejador para rutas no encontradas (404)
exports.notFoundHandler = (req, res) => {
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
};

// Manejador global de errores (500)
exports.globalErrorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    console.error(err.stack);
    
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Error interno del servidor',
        timestamp: new Date().toISOString()
    });
};
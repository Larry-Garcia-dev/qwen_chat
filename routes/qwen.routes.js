const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const qwenController = require('../controllers/qwen.controller');

// ==========================================
// Configuración de Multer para uploads organizados
// ==========================================

const UPLOAD_BASE = 'uploads';

// Asegurar que los directorios existan
const ensureDir = (dir) => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
    return fullPath;
};

// Determinar el subdirectorio basándose en el tipo de archivo
const getSubDir = (mimetype, fieldname) => {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    if (fieldname === 'audio') return 'audio';
    return 'documents';
};

// Storage dinámico que organiza archivos por tipo
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const subDir = getSubDir(file.mimetype, file.fieldname);
        const uploadPath = path.join(UPLOAD_BASE, subDir);
        ensureDir(uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Limpiar el nombre original y agregar timestamp
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueName = `${Date.now()}-${cleanName}`;
        cb(null, uniqueName);
    }
});

// Filtro de archivos permitidos
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        // Imágenes
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
        // Audio
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/flac', 'audio/x-m4a',
        // Video
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
        // Documentos
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
    }
};

// Configuración de Multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 150 * 1024 * 1024, // 150MB máximo (limite de DashScope)
    }
});

// Middleware para manejar errores de multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'El archivo excede el tamaño máximo permitido (50MB)'
            });
        }
        return res.status(400).json({
            success: false,
            error: `Error de upload: ${err.message}`
        });
    } else if (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
    next();
};

// ==========================================
// Endpoints
// ==========================================

// Health check
router.get('/health', qwenController.healthCheck);

// Chat de texto
router.post('/chat', qwenController.handleChat);

// Generar imagen desde texto
router.post('/generate-image', qwenController.handleImageGeneration);

// Generar video (Text-to-Video o Image-to-Video)
router.post('/generate-video', 
    upload.single('file'), 
    handleMulterError,
    qwenController.handleVideoGeneration
);

// Text to Speech
router.post('/tts', qwenController.handleTextToSpeech);

// Audio to Text (Speech-to-Text)
// Acepta 'file' o 'audio' como nombre del campo
router.post('/audio-stt', 
    upload.single('file'), 
    handleMulterError,
    qwenController.handleAudioToText
);

// Análisis multimodal (imágenes, documentos)
router.post('/multimodal', 
    upload.single('file'), 
    handleMulterError,
    qwenController.handleMultimodal
);

module.exports = router;

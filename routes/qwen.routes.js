const express = require('express');
const router = express.Router();
const { upload, handleMulterError } = require('../middlewares/upload.middleware');
const { asyncHandler } = require('../middlewares/async.middleware');
const { initializeUploadDirs } = require('../utils/api.util');

// Controladores
const mediaCtrl = require('../controllers/media.controller');
const analysisCtrl = require('../controllers/analysis.controller');
const systemCtrl = require('../controllers/system.controller'); // Aquí puedes poner tu healthCheck

// Inicializar carpetas al cargar rutas
initializeUploadDirs();

// System
router.get('/health', systemCtrl.healthCheck);

// Análisis & Chat (Texto, Visión, Documentos)
router.post('/chat', asyncHandler(analysisCtrl.handleChat));
router.post('/multimodal', upload.single('file'), handleMulterError, asyncHandler(analysisCtrl.handleMultimodal));

// Generación (Imagen, Video)
router.post('/generate-image', asyncHandler(mediaCtrl.handleImageGeneration));
router.post('/generate-video', upload.single('file'), handleMulterError, asyncHandler(mediaCtrl.handleVideoGeneration));

// Audio (TTS, STT)
router.post('/tts', asyncHandler(mediaCtrl.handleTextToSpeech));
router.post('/audio-stt', upload.single('file'), handleMulterError, asyncHandler(mediaCtrl.handleAudioToText));

module.exports = router;
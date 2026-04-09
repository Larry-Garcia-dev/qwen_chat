const express = require('express');
const router = express.Router();
const multer = require('multer');
const qwenController = require('../controllers/qwen.controller');

// Configuración de multer para guardar temporalmente
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Endpoints
router.post('/chat', qwenController.handleChat);
router.post('/generate-image', qwenController.handleImageGeneration);
router.post('/generate-video', upload.single('file'), qwenController.handleVideoGeneration);
router.post('/tts', qwenController.handleTextToSpeech);
router.post('/audio-stt', upload.single('file'), qwenController.handleAudioToText);
router.post('/multimodal', upload.single('file'), qwenController.handleMultimodal);

module.exports = router;
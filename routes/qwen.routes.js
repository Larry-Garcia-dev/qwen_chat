const express = require('express');
const router = express.Router();
const multer = require('multer');
const qwenController = require('../controllers/qwen.controller');

// Configuración de almacenamiento local
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Endpoints
router.post('/chat', qwenController.handleChat);
router.post('/audio-stt', upload.single('audio'), qwenController.handleAudioToText);
router.post('/text-tts', qwenController.handleTextToAudio);
router.post('/multimodal', upload.single('file'), qwenController.handleMultimodal);
router.post('/generate-image', qwenController.handleImageGeneration);

module.exports = router;
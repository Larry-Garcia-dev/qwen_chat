const QwenService = require('../services/qwen.service');

exports.handleChat = async (req, res) => {
    try {
        const response = await QwenService.chat(req.body.prompt);
        res.json({ success: true, data: response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.handleImageGeneration = async (req, res) => {
    try {
        const response = await QwenService.generateImage(req.body.prompt);
        res.json({ success: true, data: response }); // Será una URL
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.handleVideoGeneration = async (req, res) => {
    try {
        const prompt = req.body.prompt;
        const fileName = req.file ? req.file.filename : null;
        // Si hay archivo, será Image-to-Video. Si no, Text-to-Video.
        const response = await QwenService.generateVideo(prompt, fileName);
        res.json({ success: true, data: response }); // Retorna la URL del video mp4
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.handleTextToSpeech = async (req, res) => {
    try {
        const response = await QwenService.textToSpeech(req.body.prompt);
        res.json({ success: true, data: response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.handleAudioToText = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se subió audio" });
        const response = await QwenService.audioToText(req.file.filename, req.body.prompt);
        res.json({ success: true, data: response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.handleMultimodal = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: "Sin archivo" });
        const response = await QwenService.chatVision(req.file.filename, req.body.prompt || "Describe esto.");
        res.json({ success: true, data: response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
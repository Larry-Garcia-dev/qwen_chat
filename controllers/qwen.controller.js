const QwenService = require('../services/qwen.service');

exports.handleChat = async (req, res) => {
    try {
        const { prompt, model } = req.body;
        const response = await QwenService.chat(prompt, model);
        res.json({ success: true, data: response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
};

exports.handleImageGeneration = async (req, res) => {
    try {
        // Nota: Wanx usa un endpoint distinto, esto requerirá ajuste futuro si usas Wanx real, 
        // pero lo dejamos igual para no romper tu UI por ahora.
        res.json({ success: true, message: "Endpoint de imagen pendiente de integración con Wanx." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.handleAudioToText = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se subió ningún audio" });
        const filePath = req.file.path; 
        res.json({ success: true, data: `Audio recibido en ${filePath}`, path: filePath });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.handleTextToAudio = async (req, res) => {
    res.json({ success: true, message: "Endpoint TTS listo." });
};

// --- ACTUALIZADO PARA RECIBIR ARCHIVO + PREGUNTA ---
exports.handleMultimodal = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: "No se subió ningún archivo" });
        
        const prompt = req.body.prompt || "Describe detalladamente este archivo.";
        const filePath = req.file.path;
        
        const response = await QwenService.chatVision(filePath, prompt);
        
        res.json({ success: true, data: response, file: filePath });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
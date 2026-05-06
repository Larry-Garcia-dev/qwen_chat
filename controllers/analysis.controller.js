const AnalysisService = require('../services/analysis.service');

exports.handleChat = async (req, res) => {
    const { prompt, enableThinking = true } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Falta prompt' });
    const response = await AnalysisService.chat(prompt.trim(), enableThinking);
    res.json({ success: true, data: response, type: 'text' });
};

exports.handleMultimodal = async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'Falta archivo' });
    
    const { prompt } = req.body;
    const defaultPrompt = 'Analiza y describe este contenido en detalle';
    const fileName = req.file.filename;
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    let response, analysisType;
    
    if (imageExts.includes(ext)) {
        analysisType = 'vision';
        response = await AnalysisService.chatVision(fileName, prompt || defaultPrompt);
    } else {
        analysisType = 'document';
        response = await AnalysisService.analyzeDocument(fileName, prompt || defaultPrompt);
    }
    
    res.json({ success: true, data: response, type: 'text', analysisType, analyzedFile: fileName });
};
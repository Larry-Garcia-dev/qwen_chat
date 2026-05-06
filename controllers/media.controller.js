const MediaService = require('../services/media.service');
const AudioService = require('../services/audio.service');

exports.handleImageGeneration = async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Falta prompt' });
    const imageUrl = await MediaService.generateImage(prompt.trim());
    res.json({ success: true, data: imageUrl, type: 'image' });
};

exports.handleVideoGeneration = async (req, res) => {
    const { prompt } = req.body;
    const fileName = req.file ? req.file.filename : null;
    if (!prompt && !fileName) return res.status(400).json({ success: false, error: 'Falta prompt/imagen' });
    const videoUrl = await MediaService.generateVideo(prompt, fileName);
    res.json({ success: true, data: videoUrl, type: 'video', mode: fileName ? 'Image-to-Video' : 'Text-to-Video' });
};

exports.handleTextToSpeech = async (req, res) => {
    const text = req.body.text || req.body.prompt;
    if (!text) return res.status(400).json({ success: false, error: 'Falta texto' });
    const audioUrl = await AudioService.textToSpeech(text.trim());
    res.json({ success: true, data: audioUrl, type: 'audio' });
};

exports.handleAudioToText = async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'Falta audio' });
    const transcription = await AudioService.audioToText(req.file.filename, req.body.prompt);
    res.json({ success: true, data: transcription, type: 'text', originalFile: req.file.filename });
};
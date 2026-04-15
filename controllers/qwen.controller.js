const QwenService = require('../services/qwen.service');

/**
 * Wrapper para manejar errores de forma consistente
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
        console.error(`[CONTROLLER ERROR] ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    });
};

/**
 * POST /api/qwen/chat
 * Chat con el modelo de texto Qwen Plus
 * Soporta memoria de conversacion y contexto de documentos
 */
exports.handleChat = asyncHandler(async (req, res) => {
    const { 
        prompt, 
        enableThinking = true, 
        conversationHistory = [], 
        documentContext = null 
    } = req.body;
    
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({
            success: false,
            error: 'El campo "prompt" es requerido y debe ser texto'
        });
    }
    
    console.log(`[CHAT] Prompt: ${prompt.substring(0, 50)}...`);
    console.log(`[CHAT] Historia: ${conversationHistory.length} mensajes`);
    if (documentContext) {
        console.log(`[CHAT] Documento en contexto: ${documentContext.fileName}`);
    }
    
    const response = await QwenService.chat(
        prompt.trim(), 
        enableThinking, 
        conversationHistory,
        documentContext
    );
    
    res.json({
        success: true,
        data: response,
        type: 'text'
    });
});

/**
 * POST /api/qwen/generate-image
 * Genera una imagen a partir de un prompt
 */
exports.handleImageGeneration = asyncHandler(async (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({
            success: false,
            error: 'El campo "prompt" es requerido para generar imagen'
        });
    }
    
    console.log(`[IMAGE] Generando imagen: ${prompt.substring(0, 50)}...`);
    const imageUrl = await QwenService.generateImage(prompt.trim());
    
    res.json({
        success: true,
        data: imageUrl,
        type: 'image'
    });
});

/**
 * POST /api/qwen/generate-video
 * Genera un video (Text-to-Video o Image-to-Video)
 */
exports.handleVideoGeneration = asyncHandler(async (req, res) => {
    const { prompt } = req.body;
    const fileName = req.file ? req.file.filename : null;
    
    if (!prompt && !fileName) {
        return res.status(400).json({
            success: false,
            error: 'Se requiere un prompt o una imagen para generar video'
        });
    }
    
    const mode = fileName ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[VIDEO] Modo: ${mode}, Prompt: ${prompt?.substring(0, 50) || 'N/A'}`);
    
    const videoUrl = await QwenService.generateVideo(prompt, fileName);
    
    res.json({
        success: true,
        data: videoUrl,
        type: 'video',
        mode: mode
    });
});

/**
 * POST /api/qwen/tts
 * Convierte texto a voz
 */
exports.handleTextToSpeech = asyncHandler(async (req, res) => {
    const { prompt, text } = req.body;
    const inputText = text || prompt; // Soportar ambos campos
    
    if (!inputText || typeof inputText !== 'string' || !inputText.trim()) {
        return res.status(400).json({
            success: false,
            error: 'El texto es requerido para convertir a voz'
        });
    }
    
    console.log(`[TTS] Texto: ${inputText.substring(0, 50)}...`);
    const audioUrl = await QwenService.textToSpeech(inputText.trim());
    
    res.json({
        success: true,
        data: audioUrl,
        type: 'audio'
    });
});

/**
 * POST /api/qwen/audio-stt
 * Convierte audio a texto (Speech-to-Text)
 */
exports.handleAudioToText = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No se subió ningún archivo de audio'
        });
    }
    
    const { prompt } = req.body;
    console.log(`[STT] Archivo: ${req.file.filename}`);
    
    const transcription = await QwenService.audioToText(req.file.filename, prompt);
    
    res.json({
        success: true,
        data: transcription,
        type: 'text',
        originalFile: req.file.filename
    });
});

/**
 * POST /api/qwen/multimodal
 * Análisis de imágenes y documentos
 * - Imagenes: usa qwen-vl-max (vision)
 * - Documentos (PDF, DOCX, XLSX, PPTX, etc.): usa Qwen-Long con File Upload API
 */
exports.handleMultimodal = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No se subió ningún archivo para analizar'
        });
    }
    
    const { prompt } = req.body;
    const defaultPrompt = 'Analiza y describe este contenido en detalle';
    const fileName = req.file.filename;
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    
    // Determinar si es imagen o documento
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const docExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv', '.json', '.epub', '.mobi', '.md'];
    
    console.log(`[MULTIMODAL] Archivo: ${fileName}, Extension: ${ext}`);
    
    let response;
    let analysisType;
    let documentContent = null;
    
    if (imageExts.includes(ext)) {
        // Usar vision para imagenes
        analysisType = 'vision';
        response = await QwenService.chatVision(fileName, prompt || defaultPrompt);
    } else if (docExts.includes(ext)) {
        // Usar Qwen-Long para documentos
        analysisType = 'document';
        const result = await QwenService.analyzeDocument(fileName, prompt || defaultPrompt);
        // El servicio ahora retorna un objeto con analysis y extractedContent
        response = result.analysis;
        documentContent = result.extractedContent;
    } else {
        return res.status(400).json({
            success: false,
            error: `Formato no soportado: ${ext}. Formatos soportados: imagenes (${imageExts.join(', ')}) y documentos (${docExts.join(', ')})`
        });
    }
    
    res.json({
        success: true,
        data: response,
        type: 'text',
        analysisType: analysisType,
        analyzedFile: fileName,
        documentContent: documentContent // Contenido extraido para guardar en contexto
    });
});

/**
 * GET /api/qwen/health
 * Health check del servicio
 */
exports.healthCheck = (req, res) => {
    res.json({
        success: true,
        message: 'Qwen API Service is running',
        timestamp: new Date().toISOString(),
        endpoints: [
            'POST /api/qwen/chat - Chat con IA',
            'POST /api/qwen/generate-image - Generar imagen',
            'POST /api/qwen/generate-video - Generar video (T2V/I2V)',
            'POST /api/qwen/tts - Texto a voz',
            'POST /api/qwen/audio-stt - Audio a texto',
            'POST /api/qwen/multimodal - Análisis visual/documentos (imagenes + PDF/DOCX/XLSX/PPTX)'
        ],
        supportedFormats: {
            images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
            documents: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'csv', 'json', 'epub', 'mobi', 'md']
        }
    });
};

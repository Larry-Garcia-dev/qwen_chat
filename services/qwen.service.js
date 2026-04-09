const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const URL_COMPATIBLE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const URL_AIGC = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc';
const URL_AIGC_INTL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc';

// Directorios para organizar uploads
const UPLOAD_DIRS = {
    images: 'uploads/images',
    audio: 'uploads/audio',
    video: 'uploads/video',
    documents: 'uploads/documents',
    generated: 'uploads/generated'
};

class QwenService {
    /**
     * Inicializa los directorios de uploads
     */
    static initializeUploadDirs() {
        Object.values(UPLOAD_DIRS).forEach(dir => {
            const fullPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(`[INIT] Directorio creado: ${fullPath}`);
            }
        });
    }

    /**
     * Obtiene los headers para las peticiones a Dashscope
     */
    static getHeaders(isAsync = false) {
        const rawApiKey = process.env.DASHSCOPE_API_KEY || '';
        const cleanKey = rawApiKey.replace(/['"]/g, '').trim();
        
        if (!cleanKey) {
            throw new Error('DASHSCOPE_API_KEY no está configurada');
        }
        
        const headers = {
            'Authorization': `Bearer ${cleanKey}`,
            'Content-Type': 'application/json'
        };
        if (isAsync) headers['X-DashScope-Async'] = 'enable';
        return headers;
    }

    /**
     * Genera la URL pública para un archivo
     */
    static getPublicUrl(fileName, subDir = '') {
        const baseUrl = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
        const filePath = subDir ? `uploads/${subDir}/${fileName}` : `uploads/${fileName}`;
        return `${baseUrl}/${filePath}`;
    }

    /**
     * Descarga un archivo desde una URL y lo guarda localmente
     */
    static async downloadAndSaveFile(url, fileName, subDir = 'generated') {
        try {
            const targetDir = path.join(process.cwd(), 'uploads', subDir);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            const filePath = path.join(targetDir, fileName);
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: 120000 // 2 minutos timeout para archivos grandes
            });
            
            const writer = fs.createWriteStream(filePath);
            await pipeline(response.data, writer);
            
            console.log(`[DOWNLOAD] Archivo guardado: ${filePath}`);
            return this.getPublicUrl(fileName, subDir);
        } catch (error) {
            console.error(`[DOWNLOAD ERROR] ${error.message}`);
            // Si falla la descarga, retornamos la URL original
            return url;
        }
    }

    /**
     * Determina el tipo de archivo basándose en su extensión o mimetype
     */
    static getFileType(filename, mimetype = '') {
        const ext = path.extname(filename).toLowerCase();
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
        const audioExts = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.flac'];
        const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const docExts = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.ppt', '.pptx'];
        
        if (imageExts.includes(ext) || mimetype.startsWith('image/')) return 'images';
        if (audioExts.includes(ext) || mimetype.startsWith('audio/')) return 'audio';
        if (videoExts.includes(ext) || mimetype.startsWith('video/')) return 'video';
        if (docExts.includes(ext)) return 'documents';
        return 'documents';
    }

    // ==========================================
    // 1. CHAT (Qwen Plus con Thinking)
    // ==========================================
    static async chat(prompt, enableThinking = true) {
        console.log(`\n[API REQUEST] Chat Qwen Plus`);
        console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
        
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('El prompt es requerido y debe ser texto');
        }

        const payload = {
            model: "qwen-plus",
            messages: [{ role: "user", content: prompt }],
            stream: false,
            enable_thinking: enableThinking
        };

        try {
            const response = await axios.post(
                `${URL_COMPATIBLE}/chat/completions`, 
                payload, 
                { headers: this.getHeaders(), timeout: 60000 }
            );
            
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('Respuesta vacía del modelo');
            }
            
            console.log(`[RESPONSE] Chat completado exitosamente`);
            return content;
        } catch (error) {
            console.error(`[ERROR] Chat: ${error.message}`);
            throw new Error(`Error en chat: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    // ==========================================
    // 2. GENERACION DE VIDEO (Wan 2.6 T2V/I2V)
    // ==========================================
    static async generateVideo(prompt, fileName = null) {
        console.log(`\n[API REQUEST] Video (Wan 2.6) - Iniciando tarea...`);
        const isI2V = !!fileName;
        console.log(`[MODE] ${isI2V ? 'Image-to-Video' : 'Text-to-Video'}`);
        
        if (!prompt && !isI2V) {
            throw new Error('Se requiere un prompt para generar video');
        }

        const payload = {
            model: isI2V ? "wan2.1-i2v-plus" : "wan2.1-t2v-plus",
            input: { prompt: prompt || "Create a cinematic video" },
            parameters: {
                prompt_extend: true,
                duration: 5,
                audio: true
            }
        };

        if (isI2V) {
            // El archivo esta en uploads/images/
            payload.input.img_url = this.getPublicUrl(fileName, 'images');
            payload.parameters.resolution = "720P";
        } else {
            payload.parameters.size = "1280*720";
        }

        try {
            // Paso A: Crear la tarea asíncrona
            const createRes = await axios.post(
                `${URL_AIGC}/video-generation/video-synthesis`, 
                payload, 
                { headers: this.getHeaders(true), timeout: 30000 }
            );
            
            const taskId = createRes.data?.output?.task_id;
            if (!taskId) {
                throw new Error('No se pudo crear la tarea de video');
            }
            
            console.log(`[TASK CREATED] ID: ${taskId}. Iniciando polling...`);

            // Paso B: Polling hasta que termine
            let attempts = 0;
            const maxAttempts = 60; // 10 minutos máximo (60 * 10 segundos)
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 10000)); // Esperar 10 segundos
                attempts++;
                
                const checkRes = await axios.get(
                    `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`, 
                    { headers: this.getHeaders(), timeout: 30000 }
                );
                
                const status = checkRes.data?.output?.task_status;
                console.log(`[POLLING ${attempts}/${maxAttempts}] Estado: ${status}`);
                
                if (status === 'SUCCEEDED') {
                    const videoUrl = checkRes.data.output.video_url;
                    console.log(`[SUCCESS] Video URL: ${videoUrl}`);
                    
                    // Descargar y guardar localmente
                    const localFileName = `video_${Date.now()}.mp4`;
                    const localUrl = await this.downloadAndSaveFile(videoUrl, localFileName, 'video');
                    return localUrl;
                }
                
                if (status === 'FAILED') {
                    const errorMsg = checkRes.data?.output?.message || 'Error desconocido';
                    throw new Error(`Renderizado fallido: ${errorMsg}`);
                }
            }
            
            throw new Error('Timeout: El video tardó demasiado en generarse');
        } catch (error) {
            console.error(`[ERROR] Video: ${error.message}`);
            throw new Error(`Error generando video: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    // ==========================================
    // 3. GENERACION DE IMAGENES (Wan 2.6 - Sync/Async)
    // ==========================================
    static async generateImage(prompt) {
        console.log(`\n[API REQUEST] Generando Imagen (Wan 2.6)`);
        console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
        
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('El prompt es requerido para generar imagen');
        }

        // Nuevo formato de payload para wan2.6-t2i (API internacional)
        const payload = {
            model: "wan2.6-t2i",
            input: {
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ]
            },
            parameters: {
                size: "1280*1280",
                n: 1,
                prompt_extend: true,
                watermark: false
            }
        };

        try {
            // Primero intentamos llamada síncrona (recomendada para wan2.6)
            console.log(`[IMAGE] Intentando llamada síncrona...`);
            const syncRes = await axios.post(
                `${URL_AIGC_INTL}/multimodal-generation/generation`, 
                payload, 
                { headers: this.getHeaders(), timeout: 120000 } // 2 min timeout para sync
            );
            
            // Verificar si es respuesta síncrona exitosa
            const choices = syncRes.data?.output?.choices;
            if (choices && choices.length > 0) {
                const imageUrl = choices[0]?.message?.content?.[0]?.image;
                if (imageUrl) {
                    console.log(`[SUCCESS] Imagen generada (sync)`);
                    const localFileName = `image_${Date.now()}.png`;
                    const localUrl = await this.downloadAndSaveFile(imageUrl, localFileName, 'images');
                    return localUrl;
                }
            }
            
            // Si no hay choices, puede ser respuesta async con task_id
            const taskId = syncRes.data?.output?.task_id;
            if (taskId) {
                console.log(`[TASK CREATED] ID: ${taskId}. Iniciando polling...`);
                return await this.pollImageTask(taskId);
            }
            
            console.log(`[DEBUG] Response: ${JSON.stringify(syncRes.data)}`);
            throw new Error('Respuesta inesperada del servicio de imagen');
            
        } catch (error) {
            // Si falla sync, intentar async
            if (error.response?.status === 400 || error.message.includes('synchronous')) {
                console.log(`[IMAGE] Sync no disponible, intentando async...`);
                return await this.generateImageAsync(prompt);
            }
            
            console.error(`[ERROR] Image: ${error.message}`);
            if (error.response?.data) {
                console.error(`[ERROR DETAIL] ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error generando imagen: ${error.response?.data?.message || error.response?.data?.error?.message || error.message}`);
        }
    }

    // Metodo auxiliar para generacion async de imagenes
    static async generateImageAsync(prompt) {
        const payload = {
            model: "wan2.6-t2i",
            input: {
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ]
            },
            parameters: {
                size: "1280*1280",
                n: 1,
                prompt_extend: true,
                watermark: false
            }
        };

        try {
            const createRes = await axios.post(
                `${URL_AIGC_INTL}/image-generation/generation`, 
                payload, 
                { headers: this.getHeaders(true), timeout: 30000 }
            );
            
            const taskId = createRes.data?.output?.task_id;
            if (!taskId) {
                console.log(`[DEBUG] Async Response: ${JSON.stringify(createRes.data)}`);
                throw new Error('No se pudo crear la tarea de imagen async');
            }
            
            console.log(`[TASK CREATED] ID: ${taskId}. Iniciando polling...`);
            return await this.pollImageTask(taskId);
            
        } catch (error) {
            console.error(`[ERROR] Image Async: ${error.message}`);
            if (error.response?.data) {
                console.error(`[ERROR DETAIL] ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error generando imagen: ${error.response?.data?.message || error.response?.data?.error?.message || error.message}`);
        }
    }

    // Metodo auxiliar para polling de tareas de imagen
    static async pollImageTask(taskId) {
        let attempts = 0;
        const maxAttempts = 40; // ~2 minutos con 3s de espera
        
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 3000));
            attempts++;
            
            const checkRes = await axios.get(
                `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`, 
                { headers: this.getHeaders(), timeout: 30000 }
            );
            
            const status = checkRes.data?.output?.task_status;
            console.log(`[POLLING ${attempts}/${maxAttempts}] Estado: ${status}`);
            
            if (status === 'SUCCEEDED') {
                // Nuevo formato de respuesta para wan2.6
                const choices = checkRes.data?.output?.choices;
                let imageUrl = choices?.[0]?.message?.content?.[0]?.image;
                
                // Fallback al formato antiguo
                if (!imageUrl) {
                    const results = checkRes.data?.output?.results;
                    imageUrl = results?.[0]?.url || results?.[0]?.b64_image;
                }
                
                if (!imageUrl) {
                    console.log(`[DEBUG] Success Response: ${JSON.stringify(checkRes.data)}`);
                    throw new Error('No se encontró URL de imagen en la respuesta');
                }
                
                console.log(`[SUCCESS] Image URL obtenida`);
                
                // Verificar si es base64 o URL
                if (imageUrl.startsWith('data:') || !imageUrl.startsWith('http')) {
                    const localFileName = `image_${Date.now()}.png`;
                    const filePath = path.join(process.cwd(), 'uploads', 'images', localFileName);
                    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
                    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                    return this.getPublicUrl(localFileName, 'images');
                }
                
                const localFileName = `image_${Date.now()}.png`;
                const localUrl = await this.downloadAndSaveFile(imageUrl, localFileName, 'images');
                return localUrl;
            }
            
            if (status === 'FAILED') {
                const errorMsg = checkRes.data?.output?.message || checkRes.data?.output?.code || 'Error desconocido';
                throw new Error(`Generación de imagen fallida: ${errorMsg}`);
            }
        }
        
        throw new Error('Timeout: La imagen tardó demasiado en generarse');
    }

    // ==========================================
    // 4. TEXT TO SPEECH (CosyVoice - Async Task)
    // ==========================================
    static async textToSpeech(text) {
        console.log(`\n[API REQUEST] Text to Speech (CosyVoice)`);
        console.log(`[TEXT] ${text.substring(0, 100)}...`);
        
        if (!text || typeof text !== 'string') {
            throw new Error('El texto es requerido para TTS');
        }

        const payload = {
            model: "cosyvoice-v1",
            input: {
                text: text
            },
            parameters: {
                voice: "longxiaochun",
                format: "mp3",
                sample_rate: 22050
            }
        };

        try {
            // Crear tarea asíncrona
            const createRes = await axios.post(
                `${URL_AIGC_INTL}/speech-synthesis/synthesis`, 
                payload, 
                { headers: this.getHeaders(true), timeout: 30000 }
            );
            
            const taskId = createRes.data?.output?.task_id;
            
            // Si hay respuesta directa (sin task_id), procesarla
            if (!taskId) {
                const audioUrl = createRes.data?.output?.audio_url 
                              || createRes.data?.output?.url;
                const audioBase64 = createRes.data?.output?.audio;
                
                if (audioBase64) {
                    const localFileName = `tts_${Date.now()}.mp3`;
                    const filePath = path.join(process.cwd(), 'uploads', 'audio', localFileName);
                    fs.writeFileSync(filePath, Buffer.from(audioBase64, 'base64'));
                    console.log(`[SUCCESS] Audio guardado desde base64`);
                    return this.getPublicUrl(localFileName, 'audio');
                }
                
                if (audioUrl) {
                    const localFileName = `tts_${Date.now()}.mp3`;
                    const localUrl = await this.downloadAndSaveFile(audioUrl, localFileName, 'audio');
                    return localUrl;
                }
                
                console.log(`[DEBUG] TTS Response: ${JSON.stringify(createRes.data)}`);
                throw new Error('No se pudo obtener audio de la respuesta directa');
            }
            
            console.log(`[TASK CREATED] ID: ${taskId}. Iniciando polling...`);

            // Polling hasta que termine
            let attempts = 0;
            const maxAttempts = 30;
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 2000));
                attempts++;
                
                const checkRes = await axios.get(
                    `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`,
                    { headers: this.getHeaders(), timeout: 30000 }
                );
                
                const status = checkRes.data?.output?.task_status;
                console.log(`[POLLING ${attempts}/${maxAttempts}] Estado: ${status}`);
                
                if (status === 'SUCCEEDED') {
                    const audioUrl = checkRes.data?.output?.audio_url 
                                  || checkRes.data?.output?.url;
                    const audioBase64 = checkRes.data?.output?.audio;
                    
                    if (audioBase64) {
                        const localFileName = `tts_${Date.now()}.mp3`;
                        const filePath = path.join(process.cwd(), 'uploads', 'audio', localFileName);
                        fs.writeFileSync(filePath, Buffer.from(audioBase64, 'base64'));
                        console.log(`[SUCCESS] Audio guardado desde base64`);
                        return this.getPublicUrl(localFileName, 'audio');
                    }
                    
                    if (audioUrl) {
                        console.log(`[SUCCESS] Audio URL: ${audioUrl}`);
                        const localFileName = `tts_${Date.now()}.mp3`;
                        const localUrl = await this.downloadAndSaveFile(audioUrl, localFileName, 'audio');
                        return localUrl;
                    }
                    
                    console.log(`[DEBUG] TTS Success Response: ${JSON.stringify(checkRes.data)}`);
                    throw new Error('No se encontró audio en la respuesta');
                }
                
                if (status === 'FAILED') {
                    const errorMsg = checkRes.data?.output?.message || 'Error desconocido';
                    throw new Error(`TTS fallido: ${errorMsg}`);
                }
            }
            
            throw new Error('Timeout: El audio tardó demasiado en generarse');
        } catch (error) {
            console.error(`[ERROR] TTS: ${error.message}`);
            if (error.response?.data) {
                console.error(`[ERROR DETAIL] ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error en TTS: ${error.response?.data?.message || error.response?.data?.error?.message || error.message}`);
        }
    }

    // ==========================================
    // 5. AUDIO TO TEXT (Paraformer)
    // ==========================================
    static async audioToText(fileName, prompt = '') {
        console.log(`\n[API REQUEST] Audio to Text (Paraformer)`);
        console.log(`[FILE] ${fileName}`);
        
        if (!fileName) {
            throw new Error('Se requiere un archivo de audio');
        }

        // El archivo esta en uploads/audio/
        const fileUrl = this.getPublicUrl(fileName, 'audio');
        console.log(`[FILE URL] ${fileUrl}`);

        const payload = {
            model: "paraformer-v2",
            input: {
                file_urls: [fileUrl]
            },
            parameters: {
                language_hints: ["es", "en"]
            }
        };

        try {
            // Crear tarea asíncrona
            const createRes = await axios.post(
                `${URL_AIGC_INTL}/transcription/transcription`,
                payload,
                { headers: this.getHeaders(true), timeout: 30000 }
            );
            
            const taskId = createRes.data?.output?.task_id;
            if (!taskId) {
                throw new Error('No se pudo crear la tarea de transcripción');
            }
            
            console.log(`[TASK CREATED] ID: ${taskId}`);

            // Polling
            let attempts = 0;
            const maxAttempts = 30;
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 3000));
                attempts++;
                
                const checkRes = await axios.get(
                    `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`,
                    { headers: this.getHeaders(), timeout: 30000 }
                );
                
                const status = checkRes.data?.output?.task_status;
                console.log(`[POLLING ${attempts}] Estado: ${status}`);
                
                if (status === 'SUCCEEDED') {
                    const results = checkRes.data?.output?.results;
                    if (results && results.length > 0) {
                        const transcription = results[0]?.transcription_url;
                        if (transcription) {
                            // Descargar transcripción
                            const transRes = await axios.get(transcription);
                            const text = transRes.data?.transcripts?.[0]?.text 
                                       || transRes.data?.text 
                                       || JSON.stringify(transRes.data);
                            return text;
                        }
                        return results[0]?.text || JSON.stringify(results);
                    }
                    throw new Error('Transcripción vacía');
                }
                
                if (status === 'FAILED') {
                    throw new Error('Transcripción fallida');
                }
            }
            
            throw new Error('Timeout en transcripción');
        } catch (error) {
            console.error(`[ERROR] STT: ${error.message}`);
            throw new Error(`Error en transcripción: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    // ==========================================
    // 6. VISION - Análisis de Imágenes/Documentos
    // ==========================================
    static async chatVision(fileName, prompt = 'Describe esta imagen en detalle') {
        console.log(`\n[API REQUEST] Vision (qwen-vl-max)`);
        console.log(`[FILE] ${fileName}`);
        console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
        
        if (!fileName) {
            throw new Error('Se requiere un archivo para análisis visual');
        }

        // El archivo esta en uploads/images/
        const fileUrl = this.getPublicUrl(fileName, 'images');
        console.log(`[FILE URL] ${fileUrl}`);

        const payload = {
            model: "qwen-vl-max",
            messages: [{
                role: "user",
                content: [
                    { type: "image_url", image_url: { url: fileUrl } },
                    { type: "text", text: prompt }
                ]
            }]
        };

        try {
            const response = await axios.post(
                `${URL_COMPATIBLE}/chat/completions`,
                payload,
                { headers: this.getHeaders(), timeout: 90000 }
            );
            
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('Respuesta vacía del modelo de visión');
            }
            
            console.log(`[SUCCESS] Vision analysis completed`);
            return content;
        } catch (error) {
            console.error(`[ERROR] Vision: ${error.message}`);
            throw new Error(`Error en análisis visual: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}

// Inicializar directorios al cargar el módulo
QwenService.initializeUploadDirs();

module.exports = QwenService;

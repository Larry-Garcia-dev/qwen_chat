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
    // 4. TEXT TO SPEECH (CosyVoice v3 - WebSocket/HTTP)
    // ==========================================
    static async textToSpeech(text) {
        console.log(`\n[API REQUEST] Text to Speech (CosyVoice v3)`);
        console.log(`[TEXT] ${text.substring(0, 100)}...`);
        
        if (!text || typeof text !== 'string') {
            throw new Error('El texto es requerido para TTS');
        }

        // Modelo internacional: cosyvoice-v3-flash con voz longanyang
        const payload = {
            model: "cosyvoice-v3-flash",
            input: {
                text: text
            },
            parameters: {
                voice: "longanyang",
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
    // 5. AUDIO TO TEXT (Fun-ASR - International)
    // ==========================================
    static async audioToText(fileName, prompt = '') {
        console.log(`\n[API REQUEST] Audio to Text (Fun-ASR)`);
        console.log(`[FILE] ${fileName}`);
        
        if (!fileName) {
            throw new Error('Se requiere un archivo de audio');
        }

        // El archivo esta en uploads/audio/
        const fileUrl = this.getPublicUrl(fileName, 'audio');
        console.log(`[FILE URL] ${fileUrl}`);

        // Modelo internacional: fun-asr (disponible en Singapore)
        const payload = {
            model: "fun-asr",
            input: {
                file_urls: [fileUrl]
            },
            parameters: {
                language_hints: ["es", "en", "zh"]
            }
        };

        try {
            // Crear tarea asíncrona usando el endpoint correcto para fun-asr
            const createRes = await axios.post(
                `https://dashscope-intl.aliyuncs.com/api/v1/services/audio/asr/transcription`,
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
    // 6. VISION - Análisis de Imágenes (solo imagenes, no PDFs)
    // ==========================================
    static async chatVision(fileName, prompt = 'Describe esta imagen en detalle') {
        console.log(`\n[API REQUEST] Vision (qwen-vl-max)`);
        console.log(`[FILE] ${fileName}`);
        console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
        
        if (!fileName) {
            throw new Error('Se requiere un archivo para análisis visual');
        }

        // Verificar si es un archivo soportado (solo imagenes)
        const ext = path.extname(fileName).toLowerCase();
        const supportedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        
        if (!supportedImageExts.includes(ext)) {
            throw new Error(`Formato no soportado: ${ext}. El modelo de vision solo soporta imagenes (JPG, PNG, GIF, WEBP, BMP). Los PDFs deben procesarse de otra manera.`);
        }

        // El archivo esta en uploads/images/
        const fileUrl = this.getPublicUrl(fileName, 'images');
        console.log(`[FILE URL] ${fileUrl}`);

        // Convertir imagen a base64 para evitar problemas de acceso a URLs privadas
        const filePath = path.join(process.cwd(), 'uploads', 'images', fileName);
        let imageContent;
        
        if (fs.existsSync(filePath)) {
            // Leer archivo y convertir a base64
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');
            const mimeType = ext === '.png' ? 'image/png' : 
                            ext === '.gif' ? 'image/gif' : 
                            ext === '.webp' ? 'image/webp' : 
                            ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
            imageContent = { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } };
            console.log(`[IMAGE] Usando base64 (${Math.round(base64Image.length/1024)}KB)`);
        } else {
            // Fallback a URL si el archivo no existe localmente
            imageContent = { type: "image_url", image_url: { url: fileUrl } };
            console.log(`[IMAGE] Usando URL externa`);
        }

        const payload = {
            model: "qwen-vl-max",
            messages: [{
                role: "user",
                content: [
                    imageContent,
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
            if (error.response?.data) {
                console.error(`[ERROR DETAIL] ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error en análisis visual: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    // ==========================================
    // 7. DOCUMENT ANALYSIS - Usando Qwen-Plus con File Upload API (Internacional)
    // Soporta: PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, EPUB, MOBI, MD
    // Nota: qwen-long solo disponible en China, usamos qwen-plus para internacional
    // ==========================================
    static async analyzeDocument(fileName, prompt = 'Resume el contenido de este documento') {
        console.log(`\n[API REQUEST] Document Analysis (Qwen-Plus)`);
        console.log(`[FILE] ${fileName}`);
        console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
        
        if (!fileName) {
            throw new Error('Se requiere un archivo para análisis');
        }

        const ext = path.extname(fileName).toLowerCase();
        const supportedDocExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv', '.json', '.epub', '.mobi', '.md'];
        const supportedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        
        // Si es imagen, usar chatVision
        if (supportedImageExts.includes(ext)) {
            return await this.chatVision(fileName, prompt);
        }
        
        // Verificar si es un documento soportado
        if (!supportedDocExts.includes(ext)) {
            throw new Error(`Formato no soportado: ${ext}. Formatos soportados: ${supportedDocExts.join(', ')}`);
        }

        // Buscar el archivo en diferentes ubicaciones
        let filePath = path.join(process.cwd(), 'uploads', 'documents', fileName);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(process.cwd(), 'uploads', 'images', fileName);
        }
        if (!fs.existsSync(filePath)) {
            filePath = path.join(process.cwd(), 'uploads', fileName);
        }
        if (!fs.existsSync(filePath)) {
            throw new Error(`Archivo no encontrado: ${fileName}`);
        }

        try {
            // Paso 1: Subir el archivo a DashScope usando la API de archivos
            console.log(`[UPLOAD] Subiendo archivo a DashScope...`);
            const fileId = await this.uploadFileToDashScope(filePath, fileName);
            console.log(`[UPLOAD SUCCESS] File ID: ${fileId}`);

            // Paso 2: Esperar a que el archivo sea procesado
            console.log(`[PROCESSING] Esperando procesamiento del archivo...`);
            await this.waitForFileProcessing(fileId);

            // Paso 3: Usar Qwen-Plus para analizar el documento (disponible internacionalmente)
            console.log(`[ANALYSIS] Analizando documento con Qwen-Plus...`);
            const result = await this.chatWithDocument(fileId, prompt);
            
            return result;
        } catch (error) {
            console.error(`[ERROR] Document Analysis: ${error.message}`);
            if (error.response?.data) {
                console.error(`[ERROR DETAIL] ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error analizando documento: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Sube un archivo a DashScope usando la API compatible con OpenAI
     */
    static async uploadFileToDashScope(filePath, fileName) {
        const FormData = require('form-data');
        const formData = new FormData();
        
        formData.append('file', fs.createReadStream(filePath), fileName);
        formData.append('purpose', 'file-extract');

        const response = await axios.post(
            `${URL_COMPATIBLE}/files`,
            formData,
            {
                headers: {
                    ...this.getHeaders(),
                    ...formData.getHeaders()
                },
                timeout: 120000 // 2 minutos para archivos grandes
            }
        );

        const fileId = response.data?.id;
        if (!fileId) {
            throw new Error('No se pudo obtener el ID del archivo subido');
        }

        return fileId;
    }

    /**
     * Espera a que un archivo sea procesado por DashScope
     */
    static async waitForFileProcessing(fileId, maxAttempts = 30) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await axios.get(
                `${URL_COMPATIBLE}/files/${fileId}`,
                { headers: this.getHeaders(), timeout: 30000 }
            );

            const status = response.data?.status;
            console.log(`[FILE STATUS ${attempt + 1}/${maxAttempts}] ${status}`);

            if (status === 'processed') {
                return true;
            }

            if (status === 'error' || status === 'failed') {
                throw new Error(`Error procesando archivo: ${response.data?.status_details || 'Error desconocido'}`);
            }

            // Esperar 2 segundos antes del siguiente intento
            await new Promise(r => setTimeout(r, 2000));
        }

        throw new Error('Timeout esperando procesamiento del archivo');
    }

    /**
     * Chat con un documento usando Qwen-Plus y el file-id
     * Nota: qwen-long no disponible internacionalmente, usamos qwen-plus
     */
    static async chatWithDocument(fileId, prompt) {
        // Primero obtener el contenido extraido del archivo
        console.log(`[EXTRACT] Obteniendo contenido del archivo...`);
        const fileContent = await this.getFileContent(fileId);
        
        // Usar qwen-plus con el contenido extraido
        const payload = {
            model: "qwen-plus",
            messages: [
                { 
                    role: "system", 
                    content: "Eres un asistente experto en analisis de documentos. Responde en el mismo idioma que el usuario. Analiza el contenido del documento proporcionado y responde las preguntas del usuario de forma precisa y detallada." 
                },
                { 
                    role: "user", 
                    content: `Contenido del documento:\n\n${fileContent}\n\n---\n\nPregunta/Instruccion del usuario: ${prompt}` 
                }
            ],
            stream: false
        };

        const response = await axios.post(
            `${URL_COMPATIBLE}/chat/completions`,
            payload,
            { headers: this.getHeaders(), timeout: 120000 }
        );

        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Respuesta vacía del modelo');
        }

        console.log(`[SUCCESS] Document analysis completed`);
        return content;
    }

    /**
     * Obtiene el contenido extraido de un archivo procesado
     */
    static async getFileContent(fileId) {
        const response = await axios.get(
            `${URL_COMPATIBLE}/files/${fileId}/content`,
            { headers: this.getHeaders(), timeout: 60000 }
        );

        // El contenido puede venir como texto directo o en un objeto
        const content = typeof response.data === 'string' 
            ? response.data 
            : response.data?.content || JSON.stringify(response.data);
        
        if (!content || content.length === 0) {
            throw new Error('No se pudo extraer contenido del archivo');
        }

        console.log(`[EXTRACT SUCCESS] Contenido extraido (${content.length} caracteres)`);
        return content;
    }

    /**
     * Elimina un archivo de DashScope (opcional, para limpieza)
     */
    static async deleteFileFromDashScope(fileId) {
        try {
            await axios.delete(
                `${URL_COMPATIBLE}/files/${fileId}`,
                { headers: this.getHeaders(), timeout: 30000 }
            );
            console.log(`[CLEANUP] Archivo ${fileId} eliminado`);
            return true;
        } catch (error) {
            console.warn(`[CLEANUP WARNING] No se pudo eliminar archivo: ${error.message}`);
            return false;
        }
    }
}

// Inicializar directorios al cargar el módulo
QwenService.initializeUploadDirs();

module.exports = QwenService;

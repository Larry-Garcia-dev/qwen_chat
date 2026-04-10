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
    // 4. TEXT TO SPEECH (CosyVoice v3 - WebSocket API)
    // CosyVoice SOLO soporta WebSocket, no HTTP
    // URL: wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference
    // ==========================================
    static async textToSpeech(text) {
        console.log(`\n[API REQUEST] Text to Speech (CosyVoice v3 WebSocket)`);
        console.log(`[TEXT] ${text.substring(0, 100)}...`);
        
        if (!text || typeof text !== 'string') {
            throw new Error('El texto es requerido para TTS');
        }

        const WebSocket = require('ws');
        const { v4: uuidv4 } = require('uuid');
        
        return new Promise((resolve, reject) => {
            const taskId = uuidv4().replace(/-/g, '');
            const audioChunks = [];
            let isTaskStarted = false;
            
            // URL WebSocket internacional
            const wsUrl = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference';
            
            console.log(`[TTS] Conectando a WebSocket...`);
            console.log(`[TTS] Task ID: ${taskId}`);
            
            const ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`
                }
            });
            
            // Timeout de 60 segundos
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Timeout: TTS tardó demasiado'));
            }, 60000);
            
            ws.on('open', () => {
                console.log(`[TTS] WebSocket conectado, enviando run-task...`);
                
                // 1. Enviar run-task para iniciar la tarea
                const runTask = {
                    header: {
                        action: "run-task",
                        task_id: taskId,
                        streaming: "duplex"
                    },
                    payload: {
                        task_group: "audio",
                        task: "tts",
                        function: "SpeechSynthesizer",
                        model: "cosyvoice-v3-flash",
                        parameters: {
                            text_type: "PlainText",
                            voice: "longanyang",
                            format: "mp3",
                            sample_rate: 22050,
                            volume: 50,
                            rate: 1,
                            pitch: 1
                        },
                        input: {}
                    }
                };
                
                ws.send(JSON.stringify(runTask));
            });
            
            ws.on('message', (data) => {
                // Convertir a string para intentar parsear como JSON primero
                const dataStr = data.toString();
                
                // Intentar parsear como JSON
                try {
                    const event = JSON.parse(dataStr);
                    const action = event.header?.action;
                    const code = event.header?.code;
                    const message = event.header?.message;
                    
                    console.log(`[TTS] Evento: ${action}, Code: ${code}, Message: ${message || 'N/A'}`);
                    
                    // Verificar errores
                    if (code && code !== 'Success' && code !== 0) {
                        console.error(`[TTS ERROR] Code: ${code}, Message: ${message}`);
                        clearTimeout(timeout);
                        ws.close();
                        reject(new Error(`TTS Error: ${message || code}`));
                        return;
                    }
                    
                    if (action === 'task-started') {
                        isTaskStarted = true;
                        console.log(`[TTS] Tarea iniciada, enviando texto...`);
                        
                        // 2. Enviar continue-task con el texto
                        const continueTask = {
                            header: {
                                action: "continue-task",
                                task_id: taskId,
                                streaming: "duplex"
                            },
                            payload: {
                                input: {
                                    text: text
                                }
                            }
                        };
                        ws.send(JSON.stringify(continueTask));
                        
                        // 3. Enviar finish-task para indicar fin del texto
                        const finishTask = {
                            header: {
                                action: "finish-task",
                                task_id: taskId,
                                streaming: "duplex"
                            },
                            payload: {
                                input: {}
                            }
                        };
                        ws.send(JSON.stringify(finishTask));
                    }
                    
                    // Verificar si hay audio en el payload (formato base64)
                    if (event.payload?.output?.audio) {
                        const audioBase64 = event.payload.output.audio;
                        const audioBuffer = Buffer.from(audioBase64, 'base64');
                        audioChunks.push(audioBuffer);
                        console.log(`[TTS] Audio chunk (base64): ${audioBuffer.length} bytes`);
                    }
                    
                    if (action === 'result-generated') {
                        // Chunk de audio generado
                        if (event.payload?.output?.audio) {
                            console.log(`[TTS] Audio en result-generated`);
                        }
                    }
                    
                    if (action === 'task-finished') {
                        console.log(`[TTS] Tarea completada`);
                        clearTimeout(timeout);
                        ws.close();
                        
                        // Guardar audio
                        if (audioChunks.length > 0) {
                            const audioBuffer = Buffer.concat(audioChunks);
                            const localFileName = `tts_${Date.now()}.mp3`;
                            const filePath = path.join(process.cwd(), 'uploads', 'audio', localFileName);
                            fs.writeFileSync(filePath, audioBuffer);
                            console.log(`[TTS SUCCESS] Audio guardado: ${localFileName} (${audioBuffer.length} bytes)`);
                            resolve(this.getPublicUrl(localFileName, 'audio'));
                        } else {
                            reject(new Error('No se recibió audio'));
                        }
                    }
                    
                    if (action === 'task-failed') {
                        const errorMsg = event.header?.message || event.payload?.message || 'Error desconocido';
                        console.error(`[TTS FAILED] ${errorMsg}`);
                        clearTimeout(timeout);
                        ws.close();
                        reject(new Error(`TTS fallido: ${errorMsg}`));
                    }
                    
                } catch (e) {
                    // No es JSON, es audio binario puro
                    if (Buffer.isBuffer(data) && data.length > 200) {
                        audioChunks.push(data);
                        console.log(`[TTS] Audio binario: ${data.length} bytes`);
                    } else {
                        console.log(`[TTS] Mensaje desconocido (${data.length} bytes): ${dataStr.substring(0, 100)}`);
                    }
                }
            });
            
            ws.on('error', (error) => {
                console.error(`[TTS WebSocket ERROR] ${error.message}`);
                clearTimeout(timeout);
                reject(new Error(`Error WebSocket TTS: ${error.message}`));
            });
            
            ws.on('close', (code, reason) => {
                console.log(`[TTS] WebSocket cerrado. Code: ${code}, Reason: ${reason || 'N/A'}`);
                clearTimeout(timeout);
                
                // Si el WebSocket se cierra y tenemos audio, guardarlo
                if (audioChunks.length > 0) {
                    const audioBuffer = Buffer.concat(audioChunks);
                    if (audioBuffer.length > 1000) { // Solo si hay suficiente audio
                        const localFileName = `tts_${Date.now()}.mp3`;
                        const filePath = path.join(process.cwd(), 'uploads', 'audio', localFileName);
                        fs.writeFileSync(filePath, audioBuffer);
                        console.log(`[TTS SUCCESS on close] Audio guardado: ${localFileName} (${audioBuffer.length} bytes)`);
                        resolve(this.getPublicUrl(localFileName, 'audio'));
                        return;
                    }
                }
                
                // Si no hay audio y la Promise no se ha resuelto, rechazar
                reject(new Error('WebSocket cerrado sin recibir audio completo'));
            });
        });
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
    // 7. DOCUMENT ANALYSIS - Extraccion local + Qwen-Plus (Internacional)
    // Soporta: PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, MD
    // Nota: qwen-long y file-extract API solo disponibles en China
    // Solucion: extraer contenido localmente y enviar a qwen-plus
    // ==========================================
    static async analyzeDocument(fileName, prompt = 'Resume el contenido de este documento') {
        console.log(`\n[API REQUEST] Document Analysis (Local Extract + Qwen-Plus)`);
        console.log(`[FILE] ${fileName}`);
        console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
        
        if (!fileName) {
            throw new Error('Se requiere un archivo para análisis');
        }

        const ext = path.extname(fileName).toLowerCase();
        const supportedDocExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv', '.json', '.md'];
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
            // Paso 1: Extraer contenido del documento localmente
            console.log(`[EXTRACT] Extrayendo contenido del documento localmente...`);
            const documentContent = await this.extractDocumentContent(filePath, ext);
            console.log(`[EXTRACT SUCCESS] Contenido extraido (${documentContent.length} caracteres)`);

            // Paso 2: Enviar contenido a Qwen-Plus para analisis
            console.log(`[ANALYSIS] Analizando documento con Qwen-Plus...`);
            
            // Limitar contenido si es muy largo (qwen-plus tiene limite de ~128k tokens)
            const maxChars = 100000; // ~25k tokens aprox
            let contentToAnalyze = documentContent;
            if (documentContent.length > maxChars) {
                contentToAnalyze = documentContent.substring(0, maxChars) + '\n\n[... contenido truncado por limite de longitud ...]';
                console.log(`[WARNING] Documento truncado de ${documentContent.length} a ${maxChars} caracteres`);
            }
            
            const payload = {
                model: "qwen-plus",
                messages: [
                    { 
                        role: "system", 
                        content: "Eres un asistente experto en analisis de documentos. Responde en el mismo idioma que el usuario. Analiza el contenido del documento proporcionado y responde las preguntas del usuario de forma precisa y detallada." 
                    },
                    { 
                        role: "user", 
                        content: `Contenido del documento:\n\n${contentToAnalyze}\n\n---\n\nPregunta/Instruccion del usuario: ${prompt}` 
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
            
        } catch (error) {
            console.error(`[ERROR] Document Analysis: ${error.message}`);
            if (error.response?.data) {
                console.error(`[ERROR DETAIL] ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error analizando documento: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Extrae el contenido de texto de un documento segun su tipo
     */
    static async extractDocumentContent(filePath, ext) {
        try {
            switch (ext) {
                case '.txt':
                case '.md':
                case '.csv':
                    return fs.readFileSync(filePath, 'utf-8');
                    
                case '.json':
                    const jsonContent = fs.readFileSync(filePath, 'utf-8');
                    return JSON.stringify(JSON.parse(jsonContent), null, 2);
                    
                case '.pdf':
                    return await this.extractPdfContent(filePath);
                    
                case '.docx':
                case '.doc':
                    return await this.extractDocxContent(filePath);
                    
                case '.xlsx':
                case '.xls':
                    return await this.extractExcelContent(filePath);
                    
                case '.pptx':
                case '.ppt':
                    return await this.extractPptContent(filePath);
                    
                default:
                    throw new Error(`Extractor no disponible para: ${ext}`);
            }
        } catch (error) {
            console.error(`[EXTRACT ERROR] ${error.message}`);
            throw new Error(`Error extrayendo contenido: ${error.message}`);
        }
    }

    /**
     * Extrae texto de un archivo PDF
     */
    static async extractPdfContent(filePath) {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text || '';
    }

    /**
     * Extrae texto de un archivo DOCX/DOC
     */
    static async extractDocxContent(filePath) {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || '';
    }

    /**
     * Extrae texto de un archivo Excel (XLSX/XLS)
     */
    static async extractExcelContent(filePath) {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        let content = '';
        
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csvData = XLSX.utils.sheet_to_csv(sheet);
            content += `\n--- Hoja: ${sheetName} ---\n${csvData}\n`;
        }
        
        return content;
    }

    /**
     * Extrae texto de un archivo PowerPoint (PPTX/PPT)
     */
    static async extractPptContent(filePath) {
        // Para PPTX usamos officeparser que soporta multiples formatos
        const officeParser = require('officeparser');
        return new Promise((resolve, reject) => {
            officeParser.parseOffice(filePath, (data, err) => {
                if (err) {
                    reject(new Error(`Error parseando PowerPoint: ${err}`));
                } else {
                    resolve(data || '');
                }
            });
        });
    }
}

// Inicializar directorios al cargar el módulo
QwenService.initializeUploadDirs();

module.exports = QwenService;

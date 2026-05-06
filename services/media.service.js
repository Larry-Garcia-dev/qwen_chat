const axios = require('axios');
const fs = require('fs');
const path = require('path');
const apiUtils = require('../utils/api.util');

const URL_AIGC = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc';
const URL_AIGC_INTL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc';

class MediaService {
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
            payload.input.img_url = apiUtils.getPublicUrl(fileName, 'images');
            payload.parameters.resolution = "720P";
        } else {
            payload.parameters.size = "1280*720";
        }

        try {
            const createRes = await axios.post(
                `${URL_AIGC}/video-generation/video-synthesis`, 
                payload, 
                { headers: apiUtils.getHeaders(true), timeout: 30000 }
            );
            
            const taskId = createRes.data?.output?.task_id;
            if (!taskId) throw new Error('No se pudo crear la tarea de video');
            
            console.log(`[TASK CREATED] ID: ${taskId}. Iniciando polling...`);

            let attempts = 0;
            const maxAttempts = 60;
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 10000));
                attempts++;
                
                const checkRes = await axios.get(
                    `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`, 
                    { headers: apiUtils.getHeaders(), timeout: 30000 }
                );
                
                const status = checkRes.data?.output?.task_status;
                console.log(`[POLLING ${attempts}/${maxAttempts}] Estado: ${status}`);
                
                if (status === 'SUCCEEDED') {
                    const videoUrl = checkRes.data.output.video_url;
                    console.log(`[SUCCESS] Video URL: ${videoUrl}`);
                    const localFileName = `video_${Date.now()}.mp4`;
                    return await apiUtils.downloadAndSaveFile(videoUrl, localFileName, 'video');
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

    static async generateImage(prompt) {
        console.log(`\n[API REQUEST] Generando Imagen (Wan 2.6)`);
        console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
        
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('El prompt es requerido para generar imagen');
        }

        const payload = {
            model: "wan2.6-t2i",
            input: {
                messages: [{ role: "user", content: [{ text: prompt }] }]
            },
            parameters: {
                size: "1280*1280",
                n: 1,
                prompt_extend: true,
                watermark: false
            }
        };

        try {
            console.log(`[IMAGE] Intentando llamada síncrona...`);
            const syncRes = await axios.post(
                `${URL_AIGC_INTL}/multimodal-generation/generation`, 
                payload, 
                { headers: apiUtils.getHeaders(), timeout: 120000 }
            );
            
            const choices = syncRes.data?.output?.choices;
            if (choices && choices.length > 0) {
                const imageUrl = choices[0]?.message?.content?.[0]?.image;
                if (imageUrl) {
                    console.log(`[SUCCESS] Imagen generada (sync)`);
                    const localFileName = `image_${Date.now()}.png`;
                    return await apiUtils.downloadAndSaveFile(imageUrl, localFileName, 'images');
                }
            }
            
            const taskId = syncRes.data?.output?.task_id;
            if (taskId) {
                console.log(`[TASK CREATED] ID: ${taskId}. Iniciando polling...`);
                return await this.pollImageTask(taskId);
            }
            
            throw new Error('Respuesta inesperada del servicio de imagen');
            
        } catch (error) {
            if (error.response?.status === 400 || error.message.includes('synchronous')) {
                console.log(`[IMAGE] Sync no disponible, intentando async...`);
                return await this.generateImageAsync(prompt);
            }
            console.error(`[ERROR] Image: ${error.message}`);
            throw new Error(`Error generando imagen: ${error.response?.data?.message || error.response?.data?.error?.message || error.message}`);
        }
    }

    static async generateImageAsync(prompt) {
        const payload = {
            model: "wan2.6-t2i",
            input: {
                messages: [{ role: "user", content: [{ text: prompt }] }]
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
                { headers: apiUtils.getHeaders(true), timeout: 30000 }
            );
            
            const taskId = createRes.data?.output?.task_id;
            if (!taskId) throw new Error('No se pudo crear la tarea de imagen async');
            
            console.log(`[TASK CREATED] ID: ${taskId}. Iniciando polling...`);
            return await this.pollImageTask(taskId);
            
        } catch (error) {
            console.error(`[ERROR] Image Async: ${error.message}`);
            throw new Error(`Error generando imagen: ${error.response?.data?.message || error.response?.data?.error?.message || error.message}`);
        }
    }

    static async pollImageTask(taskId) {
        let attempts = 0;
        const maxAttempts = 40;
        
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 3000));
            attempts++;
            
            const checkRes = await axios.get(
                `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`, 
                { headers: apiUtils.getHeaders(), timeout: 30000 }
            );
            
            const status = checkRes.data?.output?.task_status;
            console.log(`[POLLING ${attempts}/${maxAttempts}] Estado: ${status}`);
            
            if (status === 'SUCCEEDED') {
                const choices = checkRes.data?.output?.choices;
                let imageUrl = choices?.[0]?.message?.content?.[0]?.image;
                
                if (!imageUrl) {
                    const results = checkRes.data?.output?.results;
                    imageUrl = results?.[0]?.url || results?.[0]?.b64_image;
                }
                
                if (!imageUrl) throw new Error('No se encontró URL de imagen en la respuesta');
                console.log(`[SUCCESS] Image URL obtenida`);
                
                if (imageUrl.startsWith('data:') || !imageUrl.startsWith('http')) {
                    const localFileName = `image_${Date.now()}.png`;
                    const filePath = path.join(process.cwd(), 'uploads', 'images', localFileName);
                    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
                    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                    return apiUtils.getPublicUrl(localFileName, 'images');
                }
                
                const localFileName = `image_${Date.now()}.png`;
                return await apiUtils.downloadAndSaveFile(imageUrl, localFileName, 'images');
            }
            
            if (status === 'FAILED') {
                const errorMsg = checkRes.data?.output?.message || checkRes.data?.output?.code || 'Error desconocido';
                throw new Error(`Generación de imagen fallida: ${errorMsg}`);
            }
        }
        throw new Error('Timeout: La imagen tardó demasiado en generarse');
    }
}

module.exports = MediaService;
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
class QwenService {
    static getHeaders() {
        const rawApiKey = process.env.DASHSCOPE_API_KEY || '';
        // Limpiamos agresivamente: quitamos comillas simples, dobles y espacios
        const cleanKey = rawApiKey.replace(/['"]/g, '').trim();
        
        if (!cleanKey) {
            console.error("🚨 ERROR: process.env.DASHSCOPE_API_KEY está vacío.");
        } else {
            console.log(`🔑 Key a enviar: ${cleanKey.substring(0, 5)}...`); 
        }

        return {
            'Authorization': `Bearer ${cleanKey}`,
            'Content-Type': 'application/json'
        };
    }

    static async chat(prompt, model = 'qwen-turbo') {
        console.log(`\n[API REQUEST] Iniciando Chat con modelo: ${model}`);
        
        const payload = {
            model: model,
            messages: [
                { role: 'system', content: 'You are a helpful and expert assistant.' },
                { role: 'user', content: prompt }
            ]
        };

        try {
            const response = await axios.post(`${BASE_URL}/chat/completions`, payload, { 
                headers: this.getHeaders() 
            });
            console.log(`[API RESPONSE - ÉXITO] Tokens:`, response.data.usage);
            return response.data.choices[0].message.content;
        } catch (error) {
            this.handleError(error, 'QWEN CHAT');
            throw error;
        }
    }

    static async chatVision(filePath, prompt) {
        console.log(`\n[API REQUEST] Preparando archivo local para Qwen-VL...`);
        
        // 1. Leer el archivo local y convertirlo a Base64
        const fileData = fs.readFileSync(filePath);
        const base64Data = Buffer.from(fileData).toString('base64');
        
        // 2. Determinar el tipo de archivo (MIME type)
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.pdf') mimeType = 'application/pdf'; 

        // 3. Crear la URL en formato Base64
        const fileUrl = `data:${mimeType};base64,${base64Data}`;

        const payload = {
            model: "qwen-vl-plus",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: fileUrl } },
                        { type: "text", text: prompt }
                    ]
                }
            ]
        };

        try {
            const response = await axios.post(`${BASE_URL}/chat/completions`, payload, { 
                headers: this.getHeaders() 
            });
            console.log(`[API RESPONSE - ÉXITO QWEN-VL] Archivo analizado.`);
            return response.data.choices[0].message.content;
        } catch (error) {
            this.handleError(error, 'QWEN VL');
            throw error;
        }
    }

    static handleError(error, context) {
        console.error(`\n[API ERROR - ${context}] Fallo en la petición:`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Detalles:`, JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(`Mensaje: ${error.message}`);
        }
    }
}

module.exports = QwenService;
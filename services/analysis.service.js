const axios = require('axios');
const fs = require('fs');
const path = require('path');
const apiUtils = require('../utils/api.util');
const documentUtils = require('../utils/document.util');

const URL_COMPATIBLE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

class AnalysisService {
    static async chat(prompt, enableThinking = true) {
        console.log(`\n[API REQUEST] Chat Qwen Plus`);
        
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
                { headers: apiUtils.getHeaders(), timeout: 60000 }
            );
            
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) throw new Error('Respuesta vacía del modelo');
            
            return content;
        } catch (error) {
            console.error(`[ERROR] Chat: ${error.message}`);
            throw new Error(`Error en chat: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    static async chatVision(fileName, prompt = 'Describe esta imagen en detalle') {
        console.log(`\n[API REQUEST] Vision (qwen-vl-max)`);
        
        if (!fileName) throw new Error('Se requiere un archivo para análisis visual');

        const ext = path.extname(fileName).toLowerCase();
        const supportedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        
        if (!supportedImageExts.includes(ext)) {
            throw new Error(`Formato no soportado: ${ext}. El modelo de vision solo soporta imagenes.`);
        }

        const fileUrl = apiUtils.getPublicUrl(fileName, 'images');
        const filePath = path.join(process.cwd(), 'uploads', 'images', fileName);
        let imageContent;
        
        if (fs.existsSync(filePath)) {
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');
            const mimeType = ext === '.png' ? 'image/png' : 
                            ext === '.gif' ? 'image/gif' : 
                            ext === '.webp' ? 'image/webp' : 
                            ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
            imageContent = { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } };
        } else {
            imageContent = { type: "image_url", image_url: { url: fileUrl } };
        }

        const payload = {
            model: "qwen-vl-max",
            messages: [{
                role: "user",
                content: [imageContent, { type: "text", text: prompt }]
            }]
        };

        try {
            const response = await axios.post(
                `${URL_COMPATIBLE}/chat/completions`,
                payload,
                { headers: apiUtils.getHeaders(), timeout: 90000 }
            );
            
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) throw new Error('Respuesta vacía del modelo de visión');
            
            return content;
        } catch (error) {
            console.error(`[ERROR] Vision: ${error.message}`);
            throw new Error(`Error en análisis visual: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    static async analyzeDocument(fileName, prompt = 'Resume el contenido de este documento') {
        console.log(`\n[API REQUEST] Document Analysis (Local Extract + Qwen-Plus)`);
        
        if (!fileName) throw new Error('Se requiere un archivo para análisis');

        const ext = path.extname(fileName).toLowerCase();
        const supportedDocExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv', '.json', '.md'];
        const supportedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        
        if (supportedImageExts.includes(ext)) {
            return await this.chatVision(fileName, prompt);
        }
        
        if (!supportedDocExts.includes(ext)) {
            throw new Error(`Formato no soportado: ${ext}. Formatos soportados: ${supportedDocExts.join(', ')}`);
        }

        let filePath = path.join(process.cwd(), 'uploads', 'documents', fileName);
        if (!fs.existsSync(filePath)) filePath = path.join(process.cwd(), 'uploads', 'images', fileName);
        if (!fs.existsSync(filePath)) filePath = path.join(process.cwd(), 'uploads', fileName);
        
        if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${fileName}`);

        try {
            const documentContent = await documentUtils.extractDocumentContent(filePath, ext);
            const maxChars = 100000;
            let contentToAnalyze = documentContent;
            
            if (documentContent.length > maxChars) {
                contentToAnalyze = documentContent.substring(0, maxChars) + '\n\n[... contenido truncado por limite de longitud ...]';
            }
            
            const payload = {
                model: "qwen-plus",
                messages: [
                    { role: "system", content: "Eres un asistente experto en analisis de documentos. Responde en el mismo idioma que el usuario. Analiza el contenido del documento proporcionado y responde las preguntas del usuario de forma precisa y detallada." },
                    { role: "user", content: `Contenido del documento:\n\n${contentToAnalyze}\n\n---\n\nPregunta/Instruccion del usuario: ${prompt}` }
                ],
                stream: false
            };

            const response = await axios.post(
                `${URL_COMPATIBLE}/chat/completions`,
                payload,
                { headers: apiUtils.getHeaders(), timeout: 120000 }
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) throw new Error('Respuesta vacía del modelo');

            return content;
            
        } catch (error) {
            console.error(`[ERROR] Document Analysis: ${error.message}`);
            throw new Error(`Error analizando documento: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}

module.exports = AnalysisService;
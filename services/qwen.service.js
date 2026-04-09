const axios = require('axios');

const URL_COMPATIBLE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const URL_AIGC = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc';

class QwenService {
    static getHeaders(isAsync = false) {
        const rawApiKey = process.env.DASHSCOPE_API_KEY || '';
        const cleanKey = rawApiKey.replace(/['"]/g, '').trim();
        
        const headers = {
            'Authorization': `Bearer ${cleanKey}`,
            'Content-Type': 'application/json'
        };
        if (isAsync) headers['X-DashScope-Async'] = 'enable';
        return headers;
    }

    static getPublicUrl(fileName) {
        const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
        return `${baseUrl}/uploads/${fileName}`;
    }

    // 1. CHAT (Qwen 3.6 Plus con "Thinking")
    static async chat(prompt) {
        console.log(`\n[API REQUEST] Chat Qwen 3.6 Plus`);
        const payload = {
            model: "qwen3.6-plus",
            messages: [{ role: "user", content: prompt }],
            stream: false, // Usamos false para simplificar la respuesta HTTP
            enable_thinking: true
        };
        const response = await axios.post(`${URL_COMPATIBLE}/chat/completions`, payload, { headers: this.getHeaders() });
        return response.data.choices[0].message.content;
    }

    // 2. TEXT TO VIDEO / IMAGE TO VIDEO (Wan 2.6)
    static async generateVideo(prompt, fileName = null) {
        console.log(`\n[API REQUEST] Video (Wan 2.6) - Iniciando tarea...`);
        const isI2V = !!fileName;
        
        const payload = {
            model: isI2V ? "wan2.6-i2v" : "wan2.6-t2v",
            input: { prompt: prompt },
            parameters: {
                prompt_extend: true,
                duration: 5, // Reducido a 5s para pruebas más rápidas, cámbialo a 10 si quieres
                audio: true,
                shot_type: "multi"
            }
        };

        if (isI2V) {
            payload.input.img_url = this.getPublicUrl(fileName);
            payload.parameters.resolution = "720P";
        } else {
            payload.parameters.size = "1280*720";
        }

        // Paso A: Enviar la tarea (Asíncrono)
        const res = await axios.post(`${URL_AIGC}/video-generation/video-synthesis`, payload, { headers: this.getHeaders(true) });
        const taskId = res.data.output.task_id;
        console.log(`[TAREA CREADA] ID: ${taskId}. Empezando Polling...`);

        // Paso B: Polling (Preguntar cada 10 segundos si ya terminó)
        while (true) {
            await new Promise(r => setTimeout(r, 10000)); 
            const checkRes = await axios.get(`https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`, { headers: this.getHeaders() });
            const status = checkRes.data.output.task_status;
            console.log(`[ESTADO VIDEO] ${status}...`);
            
            if (status === 'SUCCEEDED') return checkRes.data.output.video_url;
            if (status === 'FAILED') throw new Error("Error en renderizado: " + JSON.stringify(checkRes.data.output));
        }
    }

    // 3. GENERACIÓN DE IMÁGENES (z-image-turbo)
    static async generateImage(prompt) {
        console.log(`\n[API REQUEST] Creando Imagen (z-image-turbo)`);
        const payload = {
            model: "z-image-turbo",
            input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
            parameters: { prompt_extend: false, size: "1024*1024" }
        };
        const response = await axios.post(`${URL_AIGC}/multimodal-generation/generation`, payload, { headers: this.getHeaders() });
        // Dashscope multimodal devuelve usualmente un array de results
        return response.data.output.results[0].image_url || JSON.stringify(response.data);
    }

    // 4. TEXT TO SPEECH (qwen3-tts)
    static async textToSpeech(text) {
        console.log(`\n[API REQUEST] Texto a Voz (qwen3-tts)`);
        const payload = {
            model: "qwen3-tts-flash-2025-11-27",
            input: { text: text },
            parameters: { voice: "Cherry" }
        };
        // Nota: A veces esta API retorna binario, ajustamos responseType si es necesario
        const response = await axios.post(`https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`, payload, { headers: this.getHeaders() });
        return response.data; // Enviamos la data cruda al frontend para evaluarla
    }

    // 5. AUDIO TO TEXT (qwen2-audio-7b)
    static async audioToText(fileName, prompt) {
        console.log(`\n[API REQUEST] Audio a Texto (qwen2-audio)`);
        const fileUrl = this.getPublicUrl(fileName);
        const payload = {
            model: "qwen2-audio-7b-instruct",
            input: { audio: fileUrl, text: prompt || "Transcribe este audio detalladamente" }
        };
        const response = await axios.post(`https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`, payload, { headers: this.getHeaders() });
        return response.data.output?.text || JSON.stringify(response.data);
    }

    // 6. VISIÓN Y DOCUMENTOS (qwen-vl-plus)
    static async chatVision(fileName, prompt) {
        console.log(`\n[API REQUEST] Analizando Documento/Imagen (qwen-vl-plus)`);
        const fileUrl = this.getPublicUrl(fileName);
        const payload = {
            model: "qwen-vl-plus",
            messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: fileUrl } }, { type: "text", text: prompt }] }]
        };
        const response = await axios.post(`${URL_COMPATIBLE}/chat/completions`, payload, { headers: this.getHeaders() });
        return response.data.choices[0].message.content;
    }
}

module.exports = QwenService;
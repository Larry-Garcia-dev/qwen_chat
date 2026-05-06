const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const UPLOAD_DIRS = {
    images: 'uploads/images',
    audio: 'uploads/audio',
    video: 'uploads/video',
    documents: 'uploads/documents',
    generated: 'uploads/generated'
};

class ApiUtil {
    static initializeUploadDirs() {
        Object.values(UPLOAD_DIRS).forEach(dir => {
            const fullPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(`[INIT] Directorio creado: ${fullPath}`);
            }
        });
    }

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

    static getPublicUrl(fileName, subDir = '') {
        const baseUrl = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
        const filePath = subDir ? `uploads/${subDir}/${fileName}` : `uploads/${fileName}`;
        return `${baseUrl}/${filePath}`;
    }

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
                timeout: 120000
            });
            
            const writer = fs.createWriteStream(filePath);
            await pipeline(response.data, writer);
            
            console.log(`[DOWNLOAD] Archivo guardado: ${filePath}`);
            return this.getPublicUrl(fileName, subDir);
        } catch (error) {
            console.error(`[DOWNLOAD ERROR] ${error.message}`);
            return url;
        }
    }
}

// Inicializar directorios al cargar la utilidad
ApiUtil.initializeUploadDirs();

module.exports = ApiUtil;
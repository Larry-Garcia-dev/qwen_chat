const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_BASE = 'uploads';

const ensureDir = (dir) => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    return fullPath;
};

const getSubDir = (mimetype, fieldname) => {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('audio/') || fieldname === 'audio') return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    return 'documents';
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const subDir = getSubDir(file.mimetype, file.fieldname);
        const uploadPath = path.join(UPLOAD_BASE, subDir);
        ensureDir(uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${Date.now()}-${cleanName}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Aquí puedes dejar el mismo array allowedMimes que tenías en tu código original
    const isAllowed = file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/') || 
                      file.mimetype.startsWith('video/') || file.mimetype.includes('pdf') || 
                      file.mimetype.includes('document') || file.mimetype.includes('text') || 
                      file.mimetype.includes('excel') || file.mimetype.includes('powerpoint') ||
                      file.mimetype.includes('msword');
                      
    if (isAllowed) cb(null, true);
    else cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
};

exports.upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 150 * 1024 * 1024 }
});

exports.handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: 'Archivo demasiado grande (Max 150MB)' });
        return res.status(400).json({ success: false, error: `Error de upload: ${err.message}` });
    } else if (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
    next();
};
exports.requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ${req.method} ${req.url}`);
    
    if (req.method === 'POST' && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        const bodyPreview = JSON.stringify(req.body).substring(0, 200);
        console.log(`[BODY] ${bodyPreview}${bodyPreview.length >= 200 ? '...' : ''}`);
    }
    
    if (req.file) {
        console.log(`[FILE] ${req.file.originalname} (${req.file.mimetype})`);
    }
    next();
};
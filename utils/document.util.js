const fs = require('fs');

class DocumentUtil {
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

    static async extractPdfContent(filePath) {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text || '';
    }

    static async extractDocxContent(filePath) {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || '';
    }

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

    static async extractPptContent(filePath) {
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

module.exports = DocumentUtil;
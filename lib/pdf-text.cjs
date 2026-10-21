const pdf = require('pdf-parse');
const cmaps = require('./pdf-cmaps.json');

// pdf-parse 1.1.1 does not ship the CMaps required by non-embedded Japanese fonts.
// Keep them local so invoice parsing never depends on a third-party font request.
class InvoiceCMapReaderFactory {
  fetch({name}) {
    if (!Object.hasOwn(cmaps, name)) return Promise.reject(new Error('Unsupported PDF CMap: ' + name));
    return Promise.resolve({cMapData: new Uint8Array(Buffer.from(cmaps[name], 'base64')), compressionType: 1});
  }
}

module.exports = async function extractInvoicePdf(data) {
  const result = await pdf({data, CMapReaderFactory: InvoiceCMapReaderFactory});
  if (!result.text || !result.text.trim()) throw new Error('PDFから文字を読み取れませんでした。文字情報を含む請求書PDFを選択してください。');
  return result;
};

/**
 * Nettoyage docx après docxtemplater (surlignage jaune des champs XXXX dans le modèle source).
 */

import PizZip from 'pizzip';

const XML_PARTS = /^word\/(document|header|footer)\d*\.xml$/;

function stripHighlightsFromXml(xml) {
  return xml
    .replace(/<w:highlight[^/]*\/>/g, '')
    .replace(/<w:highlight[^>]*>[\s\S]*?<\/w:highlight>/g, '');
}

/** Retire le surlignage Word (ex. jaune sur les champs préremplis). */
export function stripDocxHighlights(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  for (const path of Object.keys(zip.files)) {
    if (!XML_PARTS.test(path)) continue;
    const file = zip.file(path);
    if (!file) continue;
    zip.file(path, stripHighlightsFromXml(file.asText()));
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

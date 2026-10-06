export function pdfFixture() {
  const stream='BT /F1 12 Tf 72 720 Td (24-18 Janitorial floor care) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let content='%PDF-1.4\n';const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(content));content+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(content);
  content+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))content+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  content+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(content);
}

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outDir = path.join(process.cwd(), 'docs');
const outFile = path.join(outDir, 'Interview-Video-Analysis-Summary.pdf');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const doc = new PDFDocument({
  size: 'A4',
  margin: 50,
  info: {
    Title: 'Interview Video Analysis Summary',
    Author: 'APITester',
    Subject: 'Business-friendly summary of interview analysis flow'
  }
});

const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

function title(text) {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f4c81').text(text);
  doc.moveDown(0.4);
}

function heading(text) {
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(text);
  doc.moveDown(0.15);
}

function paragraph(text) {
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text(text, { lineGap: 2 });
}

function bullet(text) {
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text('• ' + text, { indent: 12, lineGap: 2 });
}

title('Interview Video Analysis Summary');
paragraph('Purpose: explain the interview video analysis module in simple terms for review, demo, and stakeholder sharing.');
paragraph('Generated: ' + new Date().toISOString());

actionSection();
criteriaSection();
workflowSection();
notesSection();

doc.moveDown(0.5);
doc.font('Helvetica-Oblique').fontSize(9).fillColor('#4b5563').text('End of summary document');

doc.end();

stream.on('finish', () => {
  console.log('Summary PDF generated:', outFile);
});

function actionSection() {
  heading('What the module does');
  bullet('Accepts a completed interview video upload.');
  bullet('Scans the video across the full interview duration.');
  bullet('Generates a behavior risk report after analysis.');
  bullet('Allows clicking report tiles to jump to the related video moment.');
}

function criteriaSection() {
  heading('What is checked');
  bullet('Eye movement away from camera, while ignoring short blinks.');
  bullet('Long pauses before answering.');
  bullet('Reading-like speaking patterns.');
  bullet('Possible background or overlapping voices.');
  bullet('Frequent screen or window switching.');
  bullet('Lip-sync between mouth movement and audio.');
  bullet('Changes in answer style or speech consistency.');
}

function workflowSection() {
  heading('How it works');
  bullet('The system samples the video at evenly spaced timestamps.');
  bullet('For each sample, it compares the current frame to the previous one.');
  bullet('It separately inspects the mouth area and both eye regions.');
  bullet('Audio is processed in small windows to detect pauses and overlap hints.');
  bullet('Each check is converted into a percentage risk score.');
  bullet('The final report shows overall risk plus detailed metric tiles.');
}

function notesSection() {
  heading('Important notes');
  bullet('This is heuristic analysis, not a face-recognition or ML-based judgment system.');
  bullet('Accuracy improves when the interview video has stable framing and clear audio.');
  bullet('The report is intended as a review aid, not a final disciplinary decision.');
}

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outDir = path.join(process.cwd(), 'docs');
const outFile = path.join(outDir, 'Interview-Video-Analysis-Code-Flow.pdf');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const doc = new PDFDocument({
  size: 'A4',
  margin: 50,
  info: {
    Title: 'Interview Video Analysis - Code Lines and Flow',
    Author: 'APITester',
    Subject: 'Code documentation for interview analysis module'
  }
});

const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

function h1(text) {
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f4c81').text(text);
  doc.moveDown(0.2);
}

function h2(text) {
  doc.moveDown(0.35);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(text);
  doc.moveDown(0.1);
}

function p(text) {
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text(text, { lineGap: 2 });
}

function bullet(text) {
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text('• ' + text, { indent: 10, lineGap: 2 });
}

function codeRef(text) {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#374151').text(text, { indent: 12, lineGap: 1 });
}

h1('Interview Video Analyzer - Code Lines Added and Analysis Flow');
p('Generated on: ' + new Date().toISOString());
p('Project: APITester (Angular)');

doc.moveDown(0.3);
h2('1) Key Code Additions (Line References)');

bullet('Metric evidence model fields for timeline jump support');
codeRef('src/app/interview-verification/interview-verification.component.ts:9-10');
codeRef('src/app/interview-verification/interview-verification.component.ts:37-40');

bullet('Video reference and click-to-seek behavior');
codeRef('src/app/interview-verification/interview-verification.component.ts:51');
codeRef('src/app/interview-verification/interview-verification.component.ts:112-130');
codeRef('src/app/interview-verification/interview-verification.component.ts:132-138');

bullet('Core sampled interview frame analysis');
codeRef('src/app/interview-verification/interview-verification.component.ts:152-280');
codeRef('sample count logic: line 161; canvas scale: lines 164-165');

bullet('ROI extraction for mouth and both eyes');
codeRef('mouth ROI: lines 196-199');
codeRef('left eye ROI: line 203 onwards');
codeRef('right eye ROI: line 210 onwards');

bullet('Sustained eye-shift detection with blink filtering');
codeRef('src/app/interview-verification/interview-verification.component.ts:528-588');
codeRef('persistent motion validation: lines 590-611');

bullet('Audio window feature extraction (energy + zero crossing)');
codeRef('src/app/interview-verification/interview-verification.component.ts:283-399');
codeRef('window size 0.5s: line 304');
codeRef('silence threshold for pauses: line 330');

bullet('Risk formula mapping and weighted final score');
codeRef('src/app/interview-verification/interview-verification.component.ts:402-488');
codeRef('criterion risks: lines 403-409; weighted score starts line 464');

bullet('Tile-click UI wiring (HTML)');
codeRef('src/app/interview-verification/interview-verification.component.html:33');
codeRef('src/app/interview-verification/interview-verification.component.html:48-49');
codeRef('src/app/interview-verification/interview-verification.component.html:54');

bullet('Tile selected / hover / labels styling (CSS)');
codeRef('src/app/interview-verification/interview-verification.component.css:93-112');
codeRef('src/app/interview-verification/interview-verification.component.css:141-148');
codeRef('src/app/interview-verification/interview-verification.component.css:197');

doc.moveDown(0.3);
h2('2) End-to-End Analysis Flow');

bullet('User uploads interview video and clicks Analyze Interview.');
bullet('System loads metadata and computes evenly spaced sample timestamps across full duration.');
bullet('For each timestamp, the video is seeked and a frame is rendered to 96x54 canvas.');
bullet('Frame difference is computed against previous sample frame to estimate motion.');
bullet('ROI differences are separately computed for mouth, left-eye region, and right-eye region.');
bullet('Scene switch events are counted when full-frame diff crosses high threshold.');
bullet('Eye shift events are detected using sustained high motion sequence logic with blink filtering.');
bullet('Audio track is decoded and processed in 0.5 second windows.');
bullet('Audio features: RMS energy, zero crossing rate, silence runs, overlap hints.');
bullet('Lip sync is measured by correlating normalized mouth-motion and aligned audio-energy series.');
bullet('Each criterion is converted to risk percent and clamped to 0-100.');
bullet('Overall risk is computed as weighted sum and classified into low-risk / needs-review / high-risk.');
bullet('For criteria with event timestamps, first occurrence time is attached to metric tile.');
bullet('When user clicks a tile, preview video seeks to that timestamp and starts playback.');

doc.moveDown(0.3);
h2('3) Criterion-wise Analysis Logic');

bullet('Frequent eye shift away from camera: sustained motion in eye ROIs; short blink-like bursts filtered.');
bullet('Sudden change in answer style/depth: derived from audio energy variance.');
bullet('Long pauses before answer delivery: consecutive low-energy windows above threshold duration.');
bullet('Reading-like response pattern: cadence consistency from energy distribution stability.');
bullet('Background/overlapping voice hints: high energy + high zero crossing windows.');
bullet('Frequent screen/window switching: high full-frame diff spikes.');
bullet('Lip sync while answering: inverse of mouth-motion to audio-energy correlation.');

doc.moveDown(0.3);
h2('4) Current Constraints / Notes');

bullet('This is sampled-timeline analysis, not every native frame at source FPS.');
bullet('Thresholds are heuristic and can be tuned per recording quality/environment.');
bullet('Face/eye ROIs are fixed geometric regions; no ML face landmarking is used yet.');
bullet('Best results require reasonably stable camera framing and clean microphone signal.');

doc.moveDown(0.6);
doc.font('Helvetica-Oblique').fontSize(9).fillColor('#4b5563').text('End of document');

doc.end();

stream.on('finish', () => {
  console.log('PDF generated:', outFile);
});

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';

interface LlmIndicator {
  label: string;
  flagged: boolean;
  detail: string;
}

interface LlmAnalysisReport {
  verdict: 'genuine' | 'suspicious' | 'likely-proxy';
  confidence: 'low' | 'medium' | 'high';
  indicators: LlmIndicator[];
  summary: string;
  model: string;
}

@Component({
  selector: 'app-gemini-interview-verification',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './gemini-interview-verification.component.html',
  styleUrls: ['./gemini-interview-verification.component.css']
})
export class GeminiInterviewVerificationComponent implements OnDestroy {
  uploadedInterviewFile?: File;
  uploadedMediaUrl = '';
  uploadStatus = 'Upload interview video for Gemini AI verification.';

  geminiApiKey = '';
  showApiKey = false;
  isLlmAnalyzing = false;
  llmStatus = '';
  llmReport?: LlmAnalysisReport;

  onInterviewVideoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selectedFile = input.files?.[0];

    this.clearPreview();
    this.llmReport = undefined;
    this.llmStatus = '';

    if (!selectedFile) {
      this.uploadedInterviewFile = undefined;
      this.uploadStatus = 'No video selected.';
      return;
    }

    if (!selectedFile.type.startsWith('video/')) {
      this.uploadedInterviewFile = undefined;
      this.uploadStatus = 'Please upload a valid interview video file.';
      return;
    }

    this.uploadedInterviewFile = selectedFile;
    this.uploadedMediaUrl = URL.createObjectURL(selectedFile);
    this.uploadStatus = `Selected: ${selectedFile.name}`;
  }

  async runLlmAnalysis(): Promise<void> {
    if (!this.uploadedInterviewFile) {
      this.llmStatus = 'Please upload an interview video first.';
      return;
    }
    if (!this.geminiApiKey.trim()) {
      this.llmStatus = 'Please enter your Gemini API key.';
      return;
    }

    this.isLlmAnalyzing = true;
    this.llmReport = undefined;
    this.llmStatus = 'Uploading video to Gemini Files API...';

    try {
      const { uri, mimeType } = await this.uploadVideoToGemini(
        this.uploadedInterviewFile,
        this.geminiApiKey.trim()
      );
      this.llmStatus = 'Video ready. Analyzing with Gemini 2.0 Flash...';
      this.llmReport = await this.analyzeWithGemini(uri, mimeType, this.geminiApiKey.trim());
      this.llmStatus = 'Gemini verification complete.';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.llmStatus = `LLM analysis failed: ${message}`;
    } finally {
      this.isLlmAnalyzing = false;
    }
  }

  private async uploadVideoToGemini(
    file: File,
    apiKey: string
  ): Promise<{ uri: string; mimeType: string }> {
    const boundary = `----GeminiBoundary${Date.now()}`;
    const mimeType = file.type || 'video/mp4';
    const metadataJson = JSON.stringify({ file: { displayName: file.name } });

    const preamble = [
      `--${boundary}`,
      'Content-Type: application/json; charset=utf-8',
      '',
      metadataJson,
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      'Content-Transfer-Encoding: binary',
      '',
      ''
    ].join('\r\n');

    const epilogue = `\r\n--${boundary}--`;
    const preambleBytes = new TextEncoder().encode(preamble);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const epilogueBytes = new TextEncoder().encode(epilogue);

    const body = new Uint8Array(preambleBytes.length + fileBytes.length + epilogueBytes.length);
    body.set(preambleBytes, 0);
    body.set(fileBytes, preambleBytes.length);
    body.set(epilogueBytes, preambleBytes.length + fileBytes.length);

    const uploadResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'X-Goog-Upload-Protocol': 'multipart'
        },
        body
      }
    );

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Upload failed (${uploadResponse.status}): ${errText}`);
    }

    const result = await uploadResponse.json();
    const fileUri: string = result.file?.uri ?? '';
    const fileName: string = result.file?.name ?? '';
    const fileMime: string = result.file?.mimeType ?? mimeType;
    let fileState: string = result.file?.state ?? 'PROCESSING';

    if (!fileUri || !fileName) {
      throw new Error('Gemini Files API did not return a valid file URI.');
    }

    while (fileState !== 'ACTIVE') {
      if (fileState === 'FAILED') {
        throw new Error('Gemini video processing failed.');
      }
      await new Promise<void>(r => setTimeout(r, 3000));
      const statusResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`
      );
      if (!statusResp.ok) {
        throw new Error('Failed to poll file status from Gemini.');
      }
      const statusData = await statusResp.json();
      fileState = statusData.state ?? 'PROCESSING';
    }

    return { uri: fileUri, mimeType: fileMime };
  }

  private async analyzeWithGemini(
    fileUri: string,
    mimeType: string,
    apiKey: string
  ): Promise<LlmAnalysisReport> {
    const prompt = `You are an expert interview integrity analyst specializing in detecting proxy interviews, impersonation, and cheating in video interviews.

Carefully analyze this entire interview video and assess whether the candidate is genuine or exhibiting anomalies consistent with a fake or proxy interview.

Check the following indicators thoroughly:
1. PROXY/IMPERSONATION: Does the voice match the face? Any sign a different person is speaking while someone else appears on screen?
2. HIDDEN COACHING: Is the candidate listening to an earpiece, tilting head toward off-screen audio, or repeating coached phrases with unnatural delay?
3. MULTIPLE/OVERLAPPING VOICES: Can you detect background whispers, a secondary voice, or an overlapping coaching voice in the audio?
4. SCREEN READING: Do the candidate's eyes move in a fixed left-to-right reading pattern rather than natural conversational eye contact?
5. VIDEO SPLICING/EDITING: Are there abrupt scene cuts, freezes, or visual inconsistencies suggesting the video was pre-recorded or edited?
6. AUDIO INCONSISTENCIES: Does audio quality, tone, or background noise change abruptly suggesting dubbed or substituted audio?
7. BEHAVIORAL ANOMALIES: Unusual consistent delays before answering, robotic or memorized responses, unnatural pauses, scripted cadence?
8. ENVIRONMENT ANOMALIES: Reflections of additional screens, extra people visible, or signs of an assisted environment?

Return your analysis as valid JSON ONLY (no markdown, no text outside the JSON):
{
  "verdict": "genuine" | "suspicious" | "likely-proxy",
  "confidence": "low" | "medium" | "high",
  "indicators": [
    { "label": "Proxy/Impersonation", "flagged": true | false, "detail": "<finding>" },
    { "label": "Hidden Coaching", "flagged": true | false, "detail": "<finding>" },
    { "label": "Multiple/Overlapping Voices", "flagged": true | false, "detail": "<finding>" },
    { "label": "Screen Reading Pattern", "flagged": true | false, "detail": "<finding>" },
    { "label": "Video Splicing/Editing", "flagged": true | false, "detail": "<finding>" },
    { "label": "Audio Inconsistencies", "flagged": true | false, "detail": "<finding>" },
    { "label": "Behavioral Anomalies", "flagged": true | false, "detail": "<finding>" },
    { "label": "Environment Anomalies", "flagged": true | false, "detail": "<finding>" }
  ],
  "summary": "<2-3 sentence summary of findings and verdict reasoning>"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { fileData: { mimeType, fileUri } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini analysis request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Gemini returned an unexpected response. Raw: ' + rawText.slice(0, 300));
    }

    const parsed = JSON.parse(jsonMatch[0]) as Omit<LlmAnalysisReport, 'model'>;
    return { ...parsed, model: 'gemini-2.0-flash' };
  }

  private clearPreview(): void {
    if (this.uploadedMediaUrl) {
      URL.revokeObjectURL(this.uploadedMediaUrl);
    }
    this.uploadedMediaUrl = '';
  }

  ngOnDestroy(): void {
    this.clearPreview();
  }
}
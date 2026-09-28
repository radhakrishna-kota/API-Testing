import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';

interface SignalSnapshot {
  durationSec: number;
  sampleCount: number;
  visualMotionEvents: number;
  sceneSwitchEvents: number;
  avgVisualMotion: number;
  avgMouthMotion: number;
  lipSyncCorrelation: number;
  longPauseCount: number;
  longestPauseSec: number;
  energyVariance: number;
  cadenceConsistency: number;
  overlapVoiceHints: number;
}

interface FreeLlmIndicator {
  label: string;
  flagged: boolean;
  detail: string;
}

interface FreeLlmReport {
  verdict: 'genuine' | 'suspicious' | 'likely-proxy';
  confidence: 'low' | 'medium' | 'high';
  indicators: FreeLlmIndicator[];
  summary: string;
  model: string;
}

@Component({
  selector: 'app-free-llm-interview-verification',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './free-llm-interview-verification.component.html',
  styleUrls: ['./free-llm-interview-verification.component.css']
})
export class FreeLlmInterviewVerificationComponent implements OnDestroy {
  uploadedInterviewFile?: File;
  uploadedMediaUrl = '';
  uploadStatus = 'Upload interview video for Free LLM verification.';

  openRouterApiKey = '';
  showApiKey = false;
  isAnalyzing = false;
  llmStatus = '';
  llmReport?: FreeLlmReport;

  selectedModel = 'meta-llama/llama-3.1-8b-instruct:free';
  availableModels = [
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)' },
    { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)' },
    { id: 'meta-llama/llama-2-7b-chat:free', name: 'Llama 2 7B (Free)' }
  ];

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

  async runFreeLlmVerification(): Promise<void> {
    if (!this.uploadedInterviewFile) {
      this.llmStatus = 'Please upload an interview video first.';
      return;
    }
    if (!this.openRouterApiKey.trim()) {
      this.llmStatus = 'Please enter your OpenRouter API key.';
      return;
    }

    this.isAnalyzing = true;
    this.llmReport = undefined;
    this.llmStatus = 'Extracting audio-visual interview signals...';

    try {
      const signals = await this.collectInterviewSignals(this.uploadedInterviewFile);
      this.llmStatus = 'Signals ready. Running free LLM verification...';
      this.llmReport = await this.analyzeWithFreeLlm(signals, this.openRouterApiKey.trim(), this.selectedModel);
      this.llmStatus = 'Free LLM verification complete.';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.llmStatus = `LLM analysis failed: ${message}`;
    } finally {
      this.isAnalyzing = false;
    }
  }

  private async collectInterviewSignals(file: File): Promise<SignalSnapshot> {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = URL.createObjectURL(file);

    await this.waitForEvent(video, 'loadedmetadata');

    const durationSec = Math.max(1, Math.floor(video.duration));
    const sampleCount = Math.max(50, Math.min(180, Math.floor(durationSec / 1.5)));

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    const visualSeries: number[] = [];
    const mouthSeries: number[] = [];
    let previousFrame: Uint8ClampedArray | null = null;
    let previousMouthFrame: Uint8ClampedArray | null = null;

    let visualMotionEvents = 0;
    let sceneSwitchEvents = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const timestamp = (durationSec * i) / Math.max(1, sampleCount - 1);
      await this.seekTo(video, timestamp);

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height).data;

      const mouthX = Math.floor(canvas.width * 0.34);
      const mouthY = Math.floor(canvas.height * 0.58);
      const mouthW = Math.floor(canvas.width * 0.32);
      const mouthH = Math.floor(canvas.height * 0.28);
      const mouthFrame = context.getImageData(mouthX, mouthY, mouthW, mouthH).data;

      const visualDiff = previousFrame ? this.calculateDiff(previousFrame, frame) : 0;
      const mouthDiff = previousMouthFrame ? this.calculateDiff(previousMouthFrame, mouthFrame) : 0;

      visualSeries.push(visualDiff);
      mouthSeries.push(mouthDiff);

      if (visualDiff > 12) {
        visualMotionEvents += 1;
      }
      if (visualDiff > 26) {
        sceneSwitchEvents += 1;
      }

      previousFrame = new Uint8ClampedArray(frame);
      previousMouthFrame = new Uint8ClampedArray(mouthFrame);
    }

    URL.revokeObjectURL(video.src);

    const audioFeatures = await this.extractAudioFeatures(file, durationSec, sampleCount);
    const normalizedMouth = this.normalizeSeries(mouthSeries);
    const normalizedAudio = this.normalizeSeries(audioFeatures.energyAtVisualSamples);
    const lipSyncCorrelation = this.computeCorrelation(normalizedMouth, normalizedAudio);

    return {
      durationSec,
      sampleCount,
      visualMotionEvents,
      sceneSwitchEvents,
      avgVisualMotion: this.average(visualSeries),
      avgMouthMotion: this.average(mouthSeries),
      lipSyncCorrelation,
      longPauseCount: audioFeatures.longPauseCount,
      longestPauseSec: audioFeatures.longestPauseSec,
      energyVariance: audioFeatures.energyVariance,
      cadenceConsistency: audioFeatures.cadenceConsistency,
      overlapVoiceHints: audioFeatures.overlapVoiceHints
    };
  }

  private async extractAudioFeatures(
    file: File,
    durationSec: number,
    visualSampleCount: number
  ): Promise<{
    energyAtVisualSamples: number[];
    longPauseCount: number;
    longestPauseSec: number;
    energyVariance: number;
    cadenceConsistency: number;
    overlapVoiceHints: number;
  }> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      const sampleRate = audioBuffer.sampleRate;
      const channelData = audioBuffer.getChannelData(0);
      const windowSec = 0.5;
      const windowSize = Math.max(1, Math.floor(sampleRate * windowSec));

      const energies: number[] = [];
      const zeroCrossRates: number[] = [];

      for (let start = 0; start < channelData.length; start += windowSize) {
        const end = Math.min(channelData.length, start + windowSize);
        let sumSquares = 0;
        let zeroCross = 0;

        for (let i = start + 1; i < end; i += 1) {
          const value = channelData[i];
          sumSquares += value * value;

          const prev = channelData[i - 1];
          if ((prev >= 0 && value < 0) || (prev < 0 && value >= 0)) {
            zeroCross += 1;
          }
        }

        const size = Math.max(1, end - start);
        energies.push(Math.sqrt(sumSquares / size));
        zeroCrossRates.push(zeroCross / size);
      }

      const silenceThreshold = 0.012;
      let runningPause = 0;
      let longPauseCount = 0;
      let longestPauseSec = 0;

      energies.forEach((energy) => {
        if (energy < silenceThreshold) {
          runningPause += windowSec;
          if (runningPause > longestPauseSec) {
            longestPauseSec = runningPause;
          }
          if (runningPause >= 2.5 && Math.abs((runningPause - 2.5) % windowSec) < 0.001) {
            longPauseCount += 1;
          }
        } else {
          runningPause = 0;
        }
      });

      let overlapVoiceHints = 0;
      for (let i = 0; i < energies.length; i += 1) {
        if (energies[i] > 0.075 && zeroCrossRates[i] > 0.18) {
          overlapVoiceHints += 1;
        }
      }

      const averageEnergy = this.average(energies);
      const energyVariance = this.variance(energies, averageEnergy);
      const cadenceConsistency = 1 - Math.min(1, Math.sqrt(energyVariance) / Math.max(averageEnergy, 0.001));

      const energyAtVisualSamples: number[] = [];
      for (let i = 0; i < visualSampleCount; i += 1) {
        const t = (durationSec * i) / Math.max(1, visualSampleCount - 1);
        const index = Math.min(energies.length - 1, Math.floor(t / windowSec));
        energyAtVisualSamples.push(index >= 0 ? energies[index] : 0);
      }

      await audioContext.close();

      return {
        energyAtVisualSamples,
        longPauseCount,
        longestPauseSec,
        energyVariance,
        cadenceConsistency,
        overlapVoiceHints
      };
    } catch {
      return {
        energyAtVisualSamples: new Array(visualSampleCount).fill(0),
        longPauseCount: 0,
        longestPauseSec: 0,
        energyVariance: 0,
        cadenceConsistency: 0,
        overlapVoiceHints: 0
      };
    }
  }

  private async analyzeWithFreeLlm(signals: SignalSnapshot, apiKey: string, modelId: string): Promise<FreeLlmReport> {
    const prompt = `You are an interview integrity analyst. Analyze the provided interview signal metrics and decide if this looks genuine, suspicious, or likely-proxy.

Signals:
- Duration(sec): ${signals.durationSec}
- Visual motion events: ${signals.visualMotionEvents}
- Scene switch events: ${signals.sceneSwitchEvents}
- Avg visual motion: ${signals.avgVisualMotion.toFixed(3)}
- Avg mouth motion: ${signals.avgMouthMotion.toFixed(3)}
- Lip-sync correlation: ${(signals.lipSyncCorrelation * 100).toFixed(1)}%
- Long pause count: ${signals.longPauseCount}
- Longest pause(sec): ${signals.longestPauseSec.toFixed(1)}
- Energy variance: ${signals.energyVariance.toFixed(3)}
- Cadence consistency: ${(signals.cadenceConsistency * 100).toFixed(1)}%
- Overlap voice hints: ${signals.overlapVoiceHints}

Return valid JSON only:
{
  "verdict": "genuine" | "suspicious" | "likely-proxy",
  "confidence": "low" | "medium" | "high",
  "indicators": [
    { "label": "Voice inconsistency", "flagged": true | false, "detail": "<finding>" },
    { "label": "Lip-sync mismatch", "flagged": true | false, "detail": "<finding>" },
    { "label": "Unnatural pauses", "flagged": true | false, "detail": "<finding>" },
    { "label": "Behavioral anomalies", "flagged": true | false, "detail": "<finding>" }
  ],
  "summary": "<2-3 sentence summary>"
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'API Tester'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: 'You are strict and output valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Free LLM request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText: string = data.choices?.[0]?.message?.content ?? '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Free LLM returned unexpected output. Raw: ' + rawText.slice(0, 300));
    }

    const parsed = JSON.parse(jsonMatch[0]) as Omit<FreeLlmReport, 'model'>;
    return {
      ...parsed,
      model: modelId
    };
  }

  private async waitForEvent(target: HTMLVideoElement, eventName: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onSuccess = (): void => {
        cleanup();
        resolve();
      };

      const onError = (): void => {
        cleanup();
        reject(new Error('Media event failed'));
      };

      const cleanup = (): void => {
        target.removeEventListener(eventName, onSuccess);
        target.removeEventListener('error', onError);
      };

      target.addEventListener(eventName, onSuccess, { once: true });
      target.addEventListener('error', onError, { once: true });
    });
  }

  private async seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const onSeeked = (): void => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = Math.min(Math.max(0, timeSec), Math.max(0, video.duration - 0.05));
    });
  }

  private calculateDiff(previous: Uint8ClampedArray, current: Uint8ClampedArray): number {
    const stride = 4;
    let total = 0;
    let count = 0;

    for (let i = 0; i < current.length; i += stride * 4) {
      const rDiff = Math.abs(current[i] - previous[i]);
      const gDiff = Math.abs(current[i + 1] - previous[i + 1]);
      const bDiff = Math.abs(current[i + 2] - previous[i + 2]);
      total += (rDiff + gDiff + bDiff) / 3;
      count += 1;
    }

    return count > 0 ? total / count : 0;
  }

  private normalizeSeries(values: number[]): number[] {
    if (values.length === 0) {
      return [];
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    if (Math.abs(max - min) < 0.0001) {
      return values.map(() => 0);
    }

    return values.map(value => (value - min) / (max - min));
  }

  private computeCorrelation(a: number[], b: number[]): number {
    const size = Math.min(a.length, b.length);
    if (size < 2) {
      return 0;
    }

    const meanA = this.average(a.slice(0, size));
    const meanB = this.average(b.slice(0, size));

    let num = 0;
    let denA = 0;
    let denB = 0;

    for (let i = 0; i < size; i += 1) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      num += da * db;
      denA += da * da;
      denB += db * db;
    }

    if (denA === 0 || denB === 0) {
      return 0;
    }

    return this.clamp(num / Math.sqrt(denA * denB), 0, 1);
  }

  private variance(values: number[], mean: number): number {
    if (values.length === 0) {
      return 0;
    }

    let sum = 0;
    values.forEach(value => {
      const diff = value - mean;
      sum += diff * diff;
    });

    return sum / values.length;
  }

  private average(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
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
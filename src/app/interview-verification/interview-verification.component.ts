import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

interface BehaviorMetricReport {
  parameter: string;
  riskPercentage: number;
  severity: 'low' | 'moderate' | 'high';
  observation: string;
  firstOccurrenceTimeSec?: number;
  highlightFrames?: number[];
}

interface InterviewAnalysisReport {
  generatedAt: string;
  analyzedDurationLabel: string;
  sampledFrames: number;
  overallRiskPercentage: number;
  overallVerdict: 'low-risk' | 'needs-review' | 'high-risk';
  metrics: BehaviorMetricReport[];
  summary: string;
}

interface VideoFeatureSnapshot {
  durationSec: number;
  sampleCount: number;
  visualMotionEvents: number;
  sceneSwitchEvents: number;
  avgVisualMotion: number;
  avgMouthMotion: number;
  maxVisualMotion: number;
  lipSyncCorrelation: number;
  longPauseCount: number;
  longestPauseSec: number;
  energyVariance: number;
  cadenceConsistency: number;
  overlapVoiceHints: number;
  eyeShiftFrames?: number[];
  longPauseFrames?: number[];
  sceneChangeFrames?: number[];
  overlapVoiceFrames?: number[];
  // New face detection signals
  faceDetectionRate: number;
  avgGazeAngle: number;
  headPoseVariance: number;
  gazeOffscreenCount: number;
  faceDiameterConsistency: number;
  faceMissingFrames: number[];
  gazeOffscreenFrames?: number[];
}

@Component({
  selector: 'app-interview-verification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './interview-verification.component.html',
  styleUrls: ['./interview-verification.component.css']
})
export class InterviewVerificationComponent implements OnDestroy {
  @ViewChild('previewVideo') previewVideoRef?: ElementRef<HTMLVideoElement>;

  uploadedInterviewFile?: File;
  uploadedMediaUrl = '';

  uploadStatus = 'Upload interview video to start analysis.';
  isAnalyzing = false;
  analysisProgress = 0;

  analysisReport?: InterviewAnalysisReport;
  selectedMetricIndex: number = -1;
  isPlayingAnalysisFrame = false;

  onInterviewVideoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selectedFile = input.files?.[0];

    this.clearPreview();
    this.analysisReport = undefined;
    this.analysisProgress = 0;

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

  async analyzeInterviewVideo(): Promise<void> {
    if (!this.uploadedInterviewFile) {
      this.uploadStatus = 'Upload interview video before analysis.';
      return;
    }

    this.isAnalyzing = true;
    this.analysisProgress = 1;
    this.uploadStatus = 'Analyzing complete interview. Please wait...';
    this.selectedMetricIndex = -1;

    try {
      const features = await this.collectCompleteInterviewFeatures(this.uploadedInterviewFile);
      this.analysisReport = this.buildReport(features);
      this.uploadStatus = 'Interview analysis complete. Report generated.';
      this.analysisProgress = 100;
    } catch {
      this.uploadStatus = 'Unable to analyze this video. Please try another recording format.';
    } finally {
      this.isAnalyzing = false;
    }
  }

  onMetricCardClick(index: number): void {
    if (!this.analysisReport || !this.previewVideoRef) {
      return;
    }

    const metric = this.analysisReport.metrics[index];
    this.selectedMetricIndex = index;

    if (metric.firstOccurrenceTimeSec !== undefined) {
      const video = this.previewVideoRef.nativeElement;
      video.currentTime = Math.max(0, Math.min(metric.firstOccurrenceTimeSec, video.duration - 0.1));
      this.isPlayingAnalysisFrame = true;

      // Auto-play for insight
      video.play().catch(() => {
        // Video play might fail due to browser policies, ignore
      });
    }
  }

  getSelectedMetricLabel(): string {
    if (this.selectedMetricIndex >= 0 && this.analysisReport) {
      const metric = this.analysisReport.metrics[this.selectedMetricIndex];
      return `Showing: ${metric.parameter}`;
    }
    return 'Click any metric card to see video location';
  }

  getProgressLabel(): string {
    if (!this.isAnalyzing && this.analysisProgress >= 100) {
      return 'Completed';
    }

    if (!this.isAnalyzing) {
      return 'Idle';
    }

    return `${this.analysisProgress}%`;
  }

  private async collectCompleteInterviewFeatures(file: File): Promise<VideoFeatureSnapshot> {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = URL.createObjectURL(file);

    await this.waitForEvent(video, 'loadedmetadata');

    const durationSec = Math.max(1, Math.floor(video.duration));
    const sampleCount = Math.max(60, Math.min(240, Math.floor(durationSec / 1.2)));

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    const visualSeries: number[] = [];
    const mouthSeries: number[] = [];
    const leftEyeSeries: number[] = [];
    const rightEyeSeries: number[] = [];
    const frameTimestamps: number[] = [];
    let previousFrame: Uint8ClampedArray | null = null;
    let previousMouthFrame: Uint8ClampedArray | null = null;
    let previousLeftEyeFrame: Uint8ClampedArray | null = null;
    let previousRightEyeFrame: Uint8ClampedArray | null = null;

    let visualMotionEvents = 0;
    let sceneSwitchEvents = 0;
    let maxVisualMotion = 0;
    let sustainedEyeShiftEvents = 0;
    const eyeShiftFrames: number[] = [];
    const sceneChangeFrames: number[] = [];

    for (let i = 0; i < sampleCount; i += 1) {
      const timestamp = (durationSec * i) / Math.max(1, sampleCount - 1);
      frameTimestamps.push(timestamp);
      await this.seekTo(video, timestamp);

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height).data;

      const mouthX = Math.floor(canvas.width * 0.34);
      const mouthY = Math.floor(canvas.height * 0.58);
      const mouthW = Math.floor(canvas.width * 0.32);
      const mouthH = Math.floor(canvas.height * 0.28);
      const mouthFrame = context.getImageData(mouthX, mouthY, mouthW, mouthH).data;

      // Left eye region: x=10%, y=20%, w=30%, h=25%
      const leftEyeX = Math.floor(canvas.width * 0.1);
      const leftEyeY = Math.floor(canvas.height * 0.2);
      const leftEyeW = Math.floor(canvas.width * 0.3);
      const leftEyeH = Math.floor(canvas.height * 0.25);
      const leftEyeFrame = context.getImageData(leftEyeX, leftEyeY, leftEyeW, leftEyeH).data;

      // Right eye region: x=60%, y=20%, w=30%, h=25%
      const rightEyeX = Math.floor(canvas.width * 0.6);
      const rightEyeY = Math.floor(canvas.height * 0.2);
      const rightEyeW = Math.floor(canvas.width * 0.3);
      const rightEyeH = Math.floor(canvas.height * 0.25);
      const rightEyeFrame = context.getImageData(rightEyeX, rightEyeY, rightEyeW, rightEyeH).data;

      const visualDiff = previousFrame ? this.calculateDiff(previousFrame, frame) : 0;
      const mouthDiff = previousMouthFrame ? this.calculateDiff(previousMouthFrame, mouthFrame) : 0;
      const leftEyeDiff = previousLeftEyeFrame ? this.calculateDiff(previousLeftEyeFrame, leftEyeFrame) : 0;
      const rightEyeDiff = previousRightEyeFrame ? this.calculateDiff(previousRightEyeFrame, rightEyeFrame) : 0;

      visualSeries.push(visualDiff);
      mouthSeries.push(mouthDiff);
      leftEyeSeries.push(leftEyeDiff);
      rightEyeSeries.push(rightEyeDiff);

      if (visualDiff > 12) {
        visualMotionEvents += 1;
      }

      if (visualDiff > 26) {
        sceneSwitchEvents += 1;
        sceneChangeFrames.push(i);
      }

      if (visualDiff > maxVisualMotion) {
        maxVisualMotion = visualDiff;
      }

      previousFrame = new Uint8ClampedArray(frame);
      previousMouthFrame = new Uint8ClampedArray(mouthFrame);
      previousLeftEyeFrame = new Uint8ClampedArray(leftEyeFrame);
      previousRightEyeFrame = new Uint8ClampedArray(rightEyeFrame);

      this.analysisProgress = Math.min(70, Math.round(((i + 1) / sampleCount) * 70));
    }

    // Detect sustained eye shift events (filtering out blinks)
    const eyeShiftResult = this.detectSustainedEyeShifts(leftEyeSeries, rightEyeSeries, frameTimestamps);
    sustainedEyeShiftEvents = eyeShiftResult.count;

    URL.revokeObjectURL(video.src);

    const audioFeatures = await this.extractAudioFeatures(file, durationSec, sampleCount);
    this.analysisProgress = 90;

    // Perform face detection analysis
    const faceFeatures = await this.performFaceDetectionAnalysis(file, durationSec, sampleCount);

    const normalizedMouth = this.normalizeSeries(mouthSeries);
    const normalizedAudio = this.normalizeSeries(audioFeatures.energyAtVisualSamples);
    const lipSyncCorrelation = this.computeCorrelation(normalizedMouth, normalizedAudio);

    this.analysisProgress = 98;

    return {
      durationSec,
      sampleCount,
      visualMotionEvents: sustainedEyeShiftEvents,
      sceneSwitchEvents,
      avgVisualMotion: this.average(visualSeries),
      avgMouthMotion: this.average(mouthSeries),
      maxVisualMotion,
      lipSyncCorrelation,
      longPauseCount: audioFeatures.longPauseCount,
      longestPauseSec: audioFeatures.longestPauseSec,
      energyVariance: audioFeatures.energyVariance,
      cadenceConsistency: audioFeatures.cadenceConsistency,
      overlapVoiceHints: audioFeatures.overlapVoiceHints,
      eyeShiftFrames: eyeShiftResult.frames,
      sceneChangeFrames,
      longPauseFrames: audioFeatures.longPauseFrames,
      overlapVoiceFrames: audioFeatures.overlapVoiceFrames,
      faceDetectionRate: faceFeatures.faceDetectionRate,
      avgGazeAngle: faceFeatures.avgGazeAngle,
      headPoseVariance: faceFeatures.headPoseVariance,
      gazeOffscreenCount: faceFeatures.gazeOffscreenCount,
      faceDiameterConsistency: faceFeatures.faceDiameterConsistency,
      faceMissingFrames: faceFeatures.faceMissingFrames,
      gazeOffscreenFrames: faceFeatures.gazeOffscreenFrames
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
    longPauseFrames: number[];
    overlapVoiceFrames: number[];
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
      const longPauseFrames: number[] = [];
      let pauseStartTime = 0;

      energies.forEach((energy, windowIndex) => {
        const windowTime = windowIndex * windowSec;
        if (energy < silenceThreshold) {
          if (runningPause === 0) {
            pauseStartTime = windowTime;
          }
          runningPause += windowSec;
          if (runningPause > longestPauseSec) {
            longestPauseSec = runningPause;
          }
          if (runningPause >= 2.5 && Math.abs((runningPause - 2.5) % windowSec) < 0.001) {
            longPauseCount += 1;
            longPauseFrames.push(pauseStartTime);
          }
        } else {
          runningPause = 0;
        }
      });

      const overlapVoiceFrames: number[] = [];
      let overlapVoiceHints = 0;
      for (let i = 0; i < energies.length; i += 1) {
        if (energies[i] > 0.075 && zeroCrossRates[i] > 0.18) {
          overlapVoiceHints += 1;
          overlapVoiceFrames.push(i * windowSec);
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
        overlapVoiceHints,
        longPauseFrames,
        overlapVoiceFrames
      };
    } catch {
      return {
        energyAtVisualSamples: new Array(visualSampleCount).fill(0),
        longPauseCount: 0,
        longestPauseSec: 0,
        energyVariance: 0,
        cadenceConsistency: 0,
        overlapVoiceHints: 0,
        longPauseFrames: [],
        overlapVoiceFrames: []
      };
    }
  }

  private buildReport(features: VideoFeatureSnapshot): InterviewAnalysisReport {
    const eyeShiftRisk = this.clamp(Math.round((features.visualMotionEvents / features.sampleCount) * 130), 0, 100);
    const styleShiftRisk = this.clamp(Math.round(features.energyVariance * 1200), 0, 100);
    const longPauseRisk = this.clamp(Math.round(features.longPauseCount * 15 + features.longestPauseSec * 7), 0, 100);
    const readingPatternRisk = this.clamp(Math.round(features.cadenceConsistency * 100), 0, 100);
    const overlapVoiceRisk = this.clamp(Math.round((features.overlapVoiceHints / Math.max(1, features.sampleCount / 2)) * 240), 0, 100);
    const windowSwitchRisk = this.clamp(Math.round((features.sceneSwitchEvents / features.sampleCount) * 300), 0, 100);
    const lipSyncRisk = this.clamp(Math.round((1 - features.lipSyncCorrelation) * 100), 0, 100);

    const metrics: BehaviorMetricReport[] = [
      {
        parameter: 'Frequent eye shift away from camera',
        riskPercentage: eyeShiftRisk,
        severity: this.getSeverity(eyeShiftRisk),
        observation: `Sustained eye shift events detected: ${features.visualMotionEvents} (blinks filtered out). Based on persistent eye region motion patterns.`,
        firstOccurrenceTimeSec: features.eyeShiftFrames && features.eyeShiftFrames.length > 0 ? features.eyeShiftFrames[0] : undefined,
        highlightFrames: features.eyeShiftFrames
      },
      {
        parameter: 'Sudden change in answer style/depth',
        riskPercentage: styleShiftRisk,
        severity: this.getSeverity(styleShiftRisk),
        observation: `Speech energy variance score: ${features.energyVariance.toFixed(3)}.`
      },
      {
        parameter: 'Long pauses before answer delivery',
        riskPercentage: longPauseRisk,
        severity: this.getSeverity(longPauseRisk),
        observation: `Long pauses detected: ${features.longPauseCount}, longest pause: ${features.longestPauseSec.toFixed(1)} sec.`,
        firstOccurrenceTimeSec: features.longPauseFrames && features.longPauseFrames.length > 0 ? features.longPauseFrames[0] : undefined,
        highlightFrames: features.longPauseFrames
      },
      {
        parameter: 'Reading-like response pattern',
        riskPercentage: readingPatternRisk,
        severity: this.getSeverity(readingPatternRisk),
        observation: `Cadence consistency score: ${(features.cadenceConsistency * 100).toFixed(1)}%.`
      },
      {
        parameter: 'Background/overlapping voice hints',
        riskPercentage: overlapVoiceRisk,
        severity: this.getSeverity(overlapVoiceRisk),
        observation: `Potential overlap voice windows: ${features.overlapVoiceHints}.`,
        firstOccurrenceTimeSec: features.overlapVoiceFrames && features.overlapVoiceFrames.length > 0 ? features.overlapVoiceFrames[0] : undefined,
        highlightFrames: features.overlapVoiceFrames
      },
      {
        parameter: 'Frequent screen/window switching',
        riskPercentage: windowSwitchRisk,
        severity: this.getSeverity(windowSwitchRisk),
        observation: `Scene-switch events across full interview: ${features.sceneSwitchEvents}.`,
        firstOccurrenceTimeSec: features.sceneChangeFrames && features.sceneChangeFrames.length > 0 ? features.sceneChangeFrames[0] : undefined,
        highlightFrames: features.sceneChangeFrames
      },
      {
        parameter: 'Lip sync of candidate while answering',
        riskPercentage: lipSyncRisk,
        severity: this.getSeverity(lipSyncRisk),
        observation: `Audio-visual sync correlation: ${(features.lipSyncCorrelation * 100).toFixed(1)}%.`
      },
      {
        parameter: 'Gaze directed away from camera (face detect)',
        riskPercentage: this.clamp(Math.round(features.gazeOffscreenCount * 5), 0, 100),
        severity: this.getSeverity(this.clamp(Math.round(features.gazeOffscreenCount * 5), 0, 100)),
        observation: `Off-screen gaze detected ${features.gazeOffscreenCount} times. Unique gaze angle: ${(features.avgGazeAngle * 57.3).toFixed(1)}°.`,
        firstOccurrenceTimeSec: features.gazeOffscreenFrames && features.gazeOffscreenFrames.length > 0 ? features.gazeOffscreenFrames[0] : undefined,
        highlightFrames: features.gazeOffscreenFrames
      },
      {
        parameter: 'Face detection stability',
        riskPercentage: this.clamp(Math.round((1 - features.faceDetectionRate) * 100), 0, 100),
        severity: this.getSeverity(this.clamp(Math.round((1 - features.faceDetectionRate) * 100), 0, 100)),
        observation: `Face detected in ${(features.faceDetectionRate * 100).toFixed(1)}% of frames. Missing face (${features.faceMissingFrames.length} frames).`,
        firstOccurrenceTimeSec: features.faceMissingFrames && features.faceMissingFrames.length > 0 ? features.faceMissingFrames[0] : undefined,
        highlightFrames: features.faceMissingFrames
      },
      {
        parameter: 'Head pose stability',
        riskPercentage: this.clamp(Math.round(features.headPoseVariance * 200), 0, 100),
        severity: this.getSeverity(this.clamp(Math.round(features.headPoseVariance * 200), 0, 100)),
        observation: `Head pose variance (yaw): ${(features.headPoseVariance * 57.3).toFixed(1)}°. Indicates unnatural head movements or multiple people.`
      }
    ];

    const gazeRisk = this.clamp(Math.round(features.gazeOffscreenCount * 5), 0, 100);
    const faceStabilityRisk = this.clamp(Math.round((1 - features.faceDetectionRate) * 100), 0, 100);
    const headPoseRisk = this.clamp(Math.round(features.headPoseVariance * 200), 0, 100);

    const weightedScore =
      eyeShiftRisk * 0.13 +
      styleShiftRisk * 0.11 +
      longPauseRisk * 0.14 +
      readingPatternRisk * 0.10 +
      overlapVoiceRisk * 0.13 +
      windowSwitchRisk * 0.10 +
      lipSyncRisk * 0.11 +
      gazeRisk * 0.10 +
      faceStabilityRisk * 0.12 +
      headPoseRisk * 0.06;

    const overallRiskPercentage = Math.round(this.clamp(weightedScore, 0, 100));
    const overallVerdict: 'low-risk' | 'needs-review' | 'high-risk' = overallRiskPercentage >= 70
      ? 'high-risk'
      : overallRiskPercentage >= 40
        ? 'needs-review'
        : 'low-risk';

    const summary =
      `Complete interview analyzed over ${this.formatDuration(features.durationSec)} with ${features.sampleCount} visual samples. ` +
      `Overall risk is ${overallRiskPercentage}% (${overallVerdict}).`;

    return {
      generatedAt: new Date().toISOString(),
      analyzedDurationLabel: this.formatDuration(features.durationSec),
      sampledFrames: features.sampleCount,
      overallRiskPercentage,
      overallVerdict,
      metrics,
      summary
    };
  }

  private async performFaceDetectionAnalysis(
    file: File,
    durationSec: number,
    sampleCount: number
  ): Promise<{
    faceDetectionRate: number;
    avgGazeAngle: number;
    headPoseVariance: number;
    gazeOffscreenCount: number;
    faceDiameterConsistency: number;
    faceMissingFrames: number[];
    gazeOffscreenFrames: number[];
  }> {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );
      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_embedder/face_landmarker_v1/float16/face_landmarker.task' },
        runningMode: 'IMAGE'
      });

      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.src = URL.createObjectURL(file);
      await this.waitForEvent(video, 'loadedmetadata');

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');

      const gazeAngles: number[] = [];
      const headPoses: { pitch: number; yaw: number; roll: number }[] = [];
      const faceDiameters: number[] = [];
      let faceDetectedCount = 0;
      let gazeOffscreenCount = 0;
      const faceMissingFrames: number[] = [];
      const gazeOffscreenFrames: number[] = [];
      const frameTimestamps: number[] = [];

      for (let i = 0; i < sampleCount; i += 1) {
        const timestamp = (durationSec * i) / Math.max(1, sampleCount - 1);
        frameTimestamps.push(timestamp);
        await this.seekTo(video, timestamp);

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        try {
          const results = faceLandmarker.detectForVideo(imageData, Math.floor(timestamp * 1000));

          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            faceDetectedCount += 1;
            const landmarks = results.faceLandmarks[0];
            
            // Calculate face bounding box diameter
            const leftMost = Math.min(...landmarks.map(lm => lm.x));
            const rightMost = Math.max(...landmarks.map(lm => lm.x));
            const topMost = Math.min(...landmarks.map(lm => lm.y));
            const bottomMost = Math.max(...landmarks.map(lm => lm.y));
            const width = rightMost - leftMost;
            const height = bottomMost - topMost;
            const diameter = Math.sqrt(width * width + height * height);
            faceDiameters.push(diameter);

            // Estimate gaze direction from eye landmarks (rough approximation)
            const leftEyeInner = landmarks[133];
            const leftEyeOuter = landmarks[130];
            const rightEyeInner = landmarks[362];
            const rightEyeOuter = landmarks[159];

            if (leftEyeInner && leftEyeOuter && rightEyeInner && rightEyeOuter) {
              const leftGaze = Math.atan2(leftEyeInner.y - leftEyeOuter.y, leftEyeInner.x - leftEyeOuter.x);
              const rightGaze = Math.atan2(rightEyeInner.y - rightEyeOuter.y, rightEyeInner.x - rightEyeOuter.x);
              const avgGaze = (leftGaze + rightGaze) / 2;
              gazeAngles.push(avgGaze);

              // Check if gaze is off-screen (extreme angles)
              if (Math.abs(avgGaze) > Math.PI * 0.6) {
                gazeOffscreenCount += 1;
                gazeOffscreenFrames.push(timestamp);
              }
            }

            // Estimate head pose from face orientation (simplified)
            const noseTip = landmarks[1];
            const forehead = landmarks[10];
            const chin = landmarks[152];
            if (noseTip && forehead && chin) {
              const pitch = Math.atan2(chin.y - forehead.y, 1);
              const yaw = Math.atan2(noseTip.x - (leftMost + rightMost) / 2, 1);
              const roll = 0; // Simplified
              headPoses.push({ pitch, yaw, roll });
            }
          } else {
            faceMissingFrames.push(timestamp);
          }
        } catch {
          faceMissingFrames.push(timestamp);
        }

        this.analysisProgress = Math.min(85, Math.round(((i + 1) / sampleCount) * 15 + 70));
      }

      await faceLandmarker.close();
      URL.revokeObjectURL(video.src);

      const faceDetectionRate = faceDetectedCount / Math.max(1, sampleCount);
      const avgGazeAngle = gazeAngles.length > 0 ? Math.abs(this.average(gazeAngles)) : 0;
      const headPoseVariance = headPoses.length > 0 
        ? this.variance(headPoses.map(hp => hp.yaw), this.average(headPoses.map(hp => hp.yaw)))
        : 0;
      const faceDiameterConsistency = faceDiameters.length > 1
        ? 1 - Math.min(1, this.variance(faceDiameters, this.average(faceDiameters)) / this.average(faceDiameters))
        : 0;

      return {
        faceDetectionRate,
        avgGazeAngle,
        headPoseVariance,
        gazeOffscreenCount,
        faceDiameterConsistency,
        faceMissingFrames,
        gazeOffscreenFrames
      };
    } catch (err) {
      return {
        faceDetectionRate: 0,
        avgGazeAngle: 0,
        headPoseVariance: 0,
        gazeOffscreenCount: 0,
        faceDiameterConsistency: 0,
        faceMissingFrames: [],
        gazeOffscreenFrames: []
      };
    }
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

  private detectSustainedEyeShifts(leftEyeSeries: number[], rightEyeSeries: number[], frameTimestamps: number[]): { count: number; frames: number[] } {
    const minMotionThreshold = 8; // Minimum motion to register
    const blinkDurationFrames = 3; // Blinks typically last <3 frames
    const minSustainedFrames = 4; // Eye shift must be sustained for 4+ frames
    const motionGapThreshold = 2; // Allow up to 2 frames of low motion within a shift

    let sustainedShiftCount = 0;
    let inMotionSequence = false;
    let sequenceStart = -1;
    let lastHighMotionIndex = -1;
    const eyeShiftFrames: number[] = [];

    for (let i = 0; i < Math.max(leftEyeSeries.length, rightEyeSeries.length); i += 1) {
      const leftMotion = i < leftEyeSeries.length ? leftEyeSeries[i] : 0;
      const rightMotion = i < rightEyeSeries.length ? rightEyeSeries[i] : 0;
      const combinedMotion = Math.max(leftMotion, rightMotion);

      const isHighMotion = combinedMotion > minMotionThreshold;

      if (isHighMotion) {
        if (!inMotionSequence) {
          inMotionSequence = true;
          sequenceStart = i;
        }
        lastHighMotionIndex = i;
      } else if (inMotionSequence) {
        // Check if gap is small enough to continue sequence
        if (i - lastHighMotionIndex <= motionGapThreshold) {
          // Continue motion sequence, gap is acceptable
        } else {
          // Motion sequence ended, evaluate if it was sustained enough
          const sequenceDuration = lastHighMotionIndex - sequenceStart + 1;
          if (sequenceDuration >= minSustainedFrames) {
            // Filter out rapid movements (blinks)
            if (sequenceDuration > blinkDurationFrames || this.isPersistentMotionPattern(leftEyeSeries, rightEyeSeries, sequenceStart, lastHighMotionIndex)) {
              sustainedShiftCount += 1;
              eyeShiftFrames.push(frameTimestamps[sequenceStart] ?? 0);
            }
          }
          inMotionSequence = false;
          sequenceStart = -1;
        }
      }
    }

    // Handle sequence that didn't terminate by end of video
    if (inMotionSequence) {
      const sequenceDuration = lastHighMotionIndex - sequenceStart + 1;
      if (sequenceDuration >= minSustainedFrames) {
        if (sequenceDuration > blinkDurationFrames || this.isPersistentMotionPattern(leftEyeSeries, rightEyeSeries, sequenceStart, lastHighMotionIndex)) {
          sustainedShiftCount += 1;
          eyeShiftFrames.push(frameTimestamps[sequenceStart] ?? 0);
        }
      }
    }

    return {
      count: sustainedShiftCount,
      frames: eyeShiftFrames
    };
  }

  private isPersistentMotionPattern(
    leftEyeSeries: number[],
    rightEyeSeries: number[],
    startIndex: number,
    endIndex: number
  ): boolean {
    const motionThreshold = 6;
    let highMotionCount = 0;

    for (let i = startIndex; i <= endIndex; i += 1) {
      const leftMotion = i < leftEyeSeries.length ? leftEyeSeries[i] : 0;
      const rightMotion = i < rightEyeSeries.length ? rightEyeSeries[i] : 0;
      const combinedMotion = Math.max(leftMotion, rightMotion);

      if (combinedMotion > motionThreshold) {
        highMotionCount += 1;
      }
    }

    const duration = endIndex - startIndex + 1;
    // Must have sustained motion in at least 60% of frames to be a real shift, not a blink
    return highMotionCount / Math.max(1, duration) >= 0.6;
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

    const correlation = num / Math.sqrt(denA * denB);
    return this.clamp(correlation, 0, 1);
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

  private getSeverity(risk: number): 'low' | 'moderate' | 'high' {
    if (risk >= 70) {
      return 'high';
    }
    if (risk >= 40) {
      return 'moderate';
    }
    return 'low';
  }

  private formatDuration(durationSec: number): string {
    const total = Math.max(0, Math.floor(durationSec));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

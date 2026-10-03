import { useRef, useCallback } from 'react';
import { AudioGraphService } from '../lib/audio/audioGraph';
import { useBoothStore } from '../store/boothStore';

/**
 * useVoiceAudio
 * 负责底层 AudioGraphService 音频图硬件抽象与 Web Audio API 级别 Orb 音量动画驱动
 */
export function useVoiceAudio() {
  const setAudioLevel = useBoothStore((s) => s.setAudioLevel);
  const audioGraphRef = useRef<AudioGraphService | null>(null);
  const rafVisualizerRef = useRef<number>(0);

  const getAudioGraph = useCallback(() => {
    if (!audioGraphRef.current) {
      audioGraphRef.current = new AudioGraphService();
    }
    return audioGraphRef.current;
  }, []);

  const startVisualizer = useCallback(() => {
    const loop = () => {
      if (audioGraphRef.current) {
        const lvl = audioGraphRef.current.getAudioLevel();
        setAudioLevel(lvl);
      }
      rafVisualizerRef.current = requestAnimationFrame(loop);
    };
    if (rafVisualizerRef.current) {
      cancelAnimationFrame(rafVisualizerRef.current);
    }
    rafVisualizerRef.current = requestAnimationFrame(loop);
  }, [setAudioLevel]);

  const stopVisualizer = useCallback(() => {
    if (rafVisualizerRef.current) {
      cancelAnimationFrame(rafVisualizerRef.current);
      rafVisualizerRef.current = 0;
    }
    setAudioLevel(0);
  }, [setAudioLevel]);

  const cleanupAudio = useCallback(() => {
    stopVisualizer();
    if (audioGraphRef.current) {
      audioGraphRef.current.cleanup();
      audioGraphRef.current = null;
    }
  }, [stopVisualizer]);

  return {
    audioGraphRef,
    getAudioGraph,
    startVisualizer,
    stopVisualizer,
    cleanupAudio,
  };
}

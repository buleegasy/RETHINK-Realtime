import { useRef, useCallback, useEffect } from 'react';
import { useBoothStore } from '../store/boothStore';
import { useAuthStore } from '../store/authStore';
import { AudioGraphService } from '../lib/audio/audioGraph';
import { MiniMaxRealtimeClient } from '../lib/minimax/client';
import { RealtimeToolDispatcher } from '../lib/tools/toolDispatcher';
import { DefaultRagProvider } from '../lib/pipelines/rag/defaultRagProvider';
import { SlidingWindowCompressor } from '../lib/pipelines/context/slidingWindowCompressor';
import { WebCryptoAesGcm } from '../lib/pipelines/security/webCryptoAesGcm';
import { BufferedTranscriptionPipeline } from '../lib/pipelines/transcription/bufferedTranscription';
import { DeidentifiedCbtReportGenerator } from '../lib/pipelines/reporting/deidentifiedReportGenerator';
import { apiFetch } from '../lib/api';
import type { CBTStage, DialogueTurn } from '../types';

export function useVoiceSession() {
  const {
    hookState,
    sessionStatus,
    duplexPhase,
    cbtStage,
    isMuted,
    callDuration,
    setHookState,
    setSessionStatus,
    setDuplexPhase,
    setCBTStage,
    setIsMuted,
    setAudioLevel,
    setActiveTranscript,
    addDialogueTurn,
    setLatestReport,
    setCrisisOverlayOpen,
    setErrorMessage,
    setCallDuration,
    resetBooth,
  } = useBoothStore();

  const user = useAuthStore((s) => s.user);
  const updateUserName = useAuthStore((s) => s.updateUserName);

  const audioGraphRef = useRef<AudioGraphService | null>(null);
  const clientRef = useRef<MiniMaxRealtimeClient | null>(null);
  const toolDispatcherRef = useRef<RealtimeToolDispatcher | null>(null);

  const ragProviderRef = useRef<DefaultRagProvider>(new DefaultRagProvider());
  const contextManagerRef = useRef<SlidingWindowCompressor>(new SlidingWindowCompressor());
  const cryptoRef = useRef<WebCryptoAesGcm>(new WebCryptoAesGcm());
  const transcriptionRef = useRef<BufferedTranscriptionPipeline>(new BufferedTranscriptionPipeline());
  const reportGeneratorRef = useRef<DeidentifiedCbtReportGenerator>(new DeidentifiedCbtReportGenerator());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafVisualizerRef = useRef<number>(0);
  const sessionIdRef = useRef<string>('');

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
    if (rafVisualizerRef.current) cancelAnimationFrame(rafVisualizerRef.current);
    rafVisualizerRef.current = requestAnimationFrame(loop);
  }, [setAudioLevel]);

  const stopVisualizer = useCallback(() => {
    if (rafVisualizerRef.current) {
      cancelAnimationFrame(rafVisualizerRef.current);
      rafVisualizerRef.current = 0;
    }
    setAudioLevel(0);
  }, [setAudioLevel]);

  useEffect(() => {
    const unsub = transcriptionRef.current.subscribe((segment) => {
      if (segment.speaker === 'user') {
        setActiveTranscript({
          user: segment.text,
          assistant: useBoothStore.getState().activeTranscript.assistant,
        });
      } else {
        setActiveTranscript({
          user: useBoothStore.getState().activeTranscript.user,
          assistant: segment.text,
        });
      }
    });
    return () => {
      unsub();
    };
  }, [setActiveTranscript]);

  const startCall = useCallback(async () => {
    setErrorMessage(null);
    setHookState('connected');
    setSessionStatus('connected');
    setDuplexPhase('speaking');

    sessionIdRef.current = `kiosk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    transcriptionRef.current.reset();

    const greetingText =
      'Hi同学，欢迎来到 RETHINK。我们的通话记录将被加密保存。我该怎么称呼你呢？名字或者喜欢的昵称都行。';

    setActiveTranscript({
      user: '',
      assistant: greetingText,
    });

    try {
      const audioGraph = getAudioGraph();

      toolDispatcherRef.current = new RealtimeToolDispatcher({
        ragProvider: ragProviderRef.current,
        onStageChange: (nextStage) => {
          setCBTStage(nextStage);
        },
        onCrisisEscalate: (_sev, _text) => {
          setCBTStage('Crisis_Escalation');
          setCrisisOverlayOpen(true);
        },
        onSaveUserInfo: (name) => {
          updateUserName(name);
        },
      });

      clientRef.current = new MiniMaxRealtimeClient({
        callbacks: {
          onOpen: () => {
            setSessionStatus('connected');
            setHookState('connected');
            clientRef.current?.triggerInitialGreeting(greetingText);
          },
          onClose: () => {},
          onError: (err: any) => {
            console.warn('[VoiceSession] 中继网络通知:', err);
          },
          onAudioDelta: (chunk) => {
            audioGraph.enqueueAudioChunk(chunk);
          },
          onTextDelta: (text) => {
            transcriptionRef.current.feedDelta('assistant', text);
          },
          onTranscriptDelta: (transcript) => {
            transcriptionRef.current.feedDelta('user', transcript);
          },
          onSpeechStarted: () => {
            audioGraph.stopPlayback();
            clientRef.current?.interrupt();
            setDuplexPhase('listening');
            const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant');
            if (asstSeg?.text) {
              addDialogueTurn({
                id: asstSeg.id,
                role: 'assistant',
                content: asstSeg.text,
                timestamp: asstSeg.timestamp,
                stage: useBoothStore.getState().cbtStage,
              });
            }
          },
          onTurnStart: () => {
            setDuplexPhase('speaking');
          },
          onTurnEnd: () => {
            setDuplexPhase('listening');
            const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant');
            if (asstSeg?.text) {
              addDialogueTurn({
                id: asstSeg.id,
                role: 'assistant',
                content: asstSeg.text,
                timestamp: asstSeg.timestamp,
                stage: useBoothStore.getState().cbtStage,
              });
            }
            const userSeg = transcriptionRef.current.finalizeCurrentTurn('user');
            if (userSeg?.text) {
              addDialogueTurn({
                id: userSeg.id,
                role: 'user',
                content: userSeg.text,
                timestamp: userSeg.timestamp,
                stage: useBoothStore.getState().cbtStage,
              });
            }
          },
          onToolCall: async (toolCall) => {
            if (toolDispatcherRef.current) {
              await toolDispatcherRef.current.dispatch(toolCall, clientRef.current);
            }
          },
        },
      });

      await audioGraph.startRecording((pcm16Base64) => {
        if (clientRef.current?.ready && useBoothStore.getState().duplexPhase === 'listening') {
          clientRef.current.sendAudioChunk(pcm16Base64);
        }
      });

      clientRef.current.connect();
      startVisualizer();

      setCallDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      addDialogueTurn({
        id: `turn_${Date.now()}`,
        role: 'assistant',
        content: greetingText,
        timestamp: Date.now(),
        stage: useBoothStore.getState().cbtStage,
      });
    } catch (err: any) {
      console.error('[VoiceSession] 启动失败:', err);
      setErrorMessage(err?.message || '麦克风设备授权或初始化失败');
      setSessionStatus('error');
      setHookState('on_hook');
    }
  }, [
    getAudioGraph,
    setHookState,
    setSessionStatus,
    setDuplexPhase,
    setCBTStage,
    setCrisisOverlayOpen,
    updateUserName,
    setErrorMessage,
    addDialogueTurn,
    setActiveTranscript,
    startVisualizer,
    setCallDuration,
  ]);

  const endCall = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopVisualizer();

    if (audioGraphRef.current) {
      audioGraphRef.current.cleanup();
      audioGraphRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    setHookState('on_hook');
    setSessionStatus('idle');
    setDuplexPhase('idle');

    const turns = useBoothStore.getState().dialogueHistory;
    const duration = useBoothStore.getState().callDuration;
    const stageReached = useBoothStore.getState().cbtStage;

    if (turns.length > 0 || duration > 5) {
      try {
        const report = await reportGeneratorRef.current.generate({
          sessionId: sessionIdRef.current,
          durationSeconds: duration,
          stageReached,
          rawUserName: user?.userName,
          turns,
        });

        setLatestReport(report);

        const plainJson = JSON.stringify({ turns, report });
        const encryptedBundle = await cryptoRef.current.encrypt(plainJson);

        const transcriptText = turns.map((t) => `${t.role}: ${t.content}`).join('\n');
        await apiFetch('/api/voice/session/persist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            duration,
            encrypted_payload: encryptedBundle,
            stage: stageReached,
            username: user?.userName || user?.displayName || 'student_user',
            transcript_text: transcriptText,
          }),
        }).catch((e) => console.warn('[VoiceSession] 后台持久化静默跳过:', e));
      } catch (err) {
        console.error('[VoiceSession] 报告生成或加密异常:', err);
      }
    }
  }, [stopVisualizer, setHookState, setSessionStatus, setDuplexPhase, user, setLatestReport]);

  const interrupt = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.interrupt();
    }
    if (audioGraphRef.current) {
      audioGraphRef.current.stopPlayback();
    }
    setDuplexPhase('listening');
  }, [setDuplexPhase]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioGraphRef.current) {
      audioGraphRef.current.setMute(nextMuted);
    }
  }, [isMuted, setIsMuted]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopVisualizer();
      if (audioGraphRef.current) audioGraphRef.current.cleanup();
      if (clientRef.current) clientRef.current.disconnect();
    };
  }, [stopVisualizer]);

  return {
    startCall,
    endCall,
    interrupt,
    toggleMute,
    hookState,
    sessionStatus,
    duplexPhase,
    cbtStage,
    isMuted,
    callDuration,
  };
}

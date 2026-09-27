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
import { safeRandomId } from '../lib/utils';
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
    addDialogueTurn,
    setLatestReport,
    setReportModalOpen,
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
  const endCallRef = useRef<(() => Promise<void>) | null>(null);

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

  const startCall = useCallback(async () => {
    setErrorMessage(null);
    setHookState('connected');
    setSessionStatus('connecting');
    setDuplexPhase('thinking');

    sessionIdRef.current = safeRandomId('kiosk');
    transcriptionRef.current.reset();

    try {
      const audioGraph = getAudioGraph();
      audioGraph.setOnPlaybackStateChange((isPlaying) => {
        if (isPlaying) {
          clientRef.current?.updateTurnDetection('speaking');
          setDuplexPhase('speaking');
        } else {
          clientRef.current?.updateTurnDetection('listening');
          setDuplexPhase('listening');
        }
      });
      audioGraph.setOnLocalInterrupt((playedMs) => {
        clientRef.current?.updateTurnDetection('listening');
        const itemId = clientRef.current?.getCurrentResponseItemId();
        clientRef.current?.interrupt({
          itemId: itemId || undefined,
          audioEndMs: playedMs,
        });
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
      });

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
        sessionId: sessionIdRef.current,
        userId: user?.uid || user?.userName,
        username: user?.displayName || user?.userName,
        callbacks: {
          onOpen: () => {
            setSessionStatus('connected');
            setHookState('connected');
            setDuplexPhase('listening');
          },
          onClose: () => {
            if (useBoothStore.getState().sessionStatus === 'connected') {
              endCallRef.current?.();
            } else if (useBoothStore.getState().sessionStatus === 'connecting') {
              setErrorMessage('语音服务器连接失败，请检查网络或稍后重试');
              setSessionStatus('error');
              setHookState('on_hook');
              if (audioGraphRef.current) {
                audioGraphRef.current.cleanup();
                audioGraphRef.current = null;
              }
            }
          },
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
          onSpeechStarted: (details) => {
            const playedMs = audioGraph.getPlaybackDurationMs();
            if (audioGraph.isPlaybackActive() && playedMs < 250) {
              return;
            }
            audioGraph.stopPlayback(150);
            clientRef.current?.updateTurnDetection('listening');
            const itemId = details?.itemId || clientRef.current?.getCurrentResponseItemId();
            clientRef.current?.interrupt({
              itemId: itemId || undefined,
              audioEndMs: playedMs,
            });
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
          onSpeechStopped: () => {
            if (useBoothStore.getState().sessionStatus === 'connected' && useBoothStore.getState().duplexPhase === 'listening') {
              setDuplexPhase('thinking');
            }
          },
          onTurnStart: () => {
            if (audioGraph.isPlaybackActive()) {
              setDuplexPhase('speaking');
            } else {
              setDuplexPhase('thinking');
            }
            audioGraph.setAiSpeaking(true);
            clientRef.current?.updateTurnDetection('speaking');
          },
          onTurnEnd: () => {
            audioGraph.setAiSpeaking(false);
            clientRef.current?.updateTurnDetection('listening');
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
              const currentStage = useBoothStore.getState().cbtStage;
              addDialogueTurn({
                id: userSeg.id,
                role: 'user',
                content: userSeg.text,
                timestamp: userSeg.timestamp,
                stage: currentStage,
              });
              if (toolDispatcherRef.current) {
                const pacing = toolDispatcherRef.current.getFsm().recordTurn('user');
                if (pacing.autoPromotedStage) {
                  setCBTStage(pacing.autoPromotedStage);
                }
              }
            }
          },
          onToolCall: async (toolCall) => {
            if (toolDispatcherRef.current) {
              await toolDispatcherRef.current.dispatch(toolCall, clientRef.current);
            }
          },
          onCrisisInterception: (details) => {
            audioGraph.stopPlayback(50);
            toolDispatcherRef.current?.getFsm().escalateCrisis(details.message);
            setCBTStage('Crisis_Escalation');
            setCrisisOverlayOpen(true);
            addDialogueTurn({
              id: `turn_${Date.now()}`,
              role: 'assistant',
              content: details.message,
              timestamp: Date.now(),
              stage: 'Crisis_Escalation',
            });
          },
        },
      });

      await audioGraph.startRecording((pcm16Base64) => {
        if (clientRef.current?.ready) {
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

    const turns = useBoothStore.getState().dialogueHistory;
    const duration = useBoothStore.getState().callDuration;
    const stageReached = useBoothStore.getState().cbtStage;
    const currentSessionId = sessionIdRef.current || safeRandomId('kiosk');

    if (turns.length > 0 || duration > 0) {
      try {
        const report = await reportGeneratorRef.current.generate({
          sessionId: currentSessionId,
          durationSeconds: duration,
          stageReached,
          rawUserName: user?.userName,
          turns,
        });

        // 存储本次个案脱敏评估报告供管理后台调阅，来访学生端不弹窗
        setLatestReport(report);

        const plainJson = JSON.stringify({ turns, report });
        let encryptedBundle = '';
        try {
          encryptedBundle = await cryptoRef.current.encrypt(plainJson);
        } catch {}

        // 异步同步至云端 Worker 深度建档（DeepSeek V4 Flash 结构化简报与情景记忆更新）
        const transcriptText = turns
          .map((t) => `${t.role === 'user' ? (user?.displayName || user?.userName || '学生') : '智能体'}: ${t.content}`)
          .join('\n');

        const localSessionRecord = {
          id: currentSessionId,
          sessionId: currentSessionId,
          duration,
          stage: stageReached,
          isCrisis: stageReached === 'Crisis_Escalation',
          crisisLevel: stageReached === 'Crisis_Escalation' ? 3 : 0,
          crisisSummary: report.emotionalTrajectory?.deltaNotes || '真实来访倾诉记录',
          coreConcerns: report.coreConcerns || ['真实交流'],
          emotionalValence: 0.0,
          deidentifiedReport: report,
          dispositionStatus: 'pending_contact',
          dispositionNote: '',
          createdAt: Math.floor(Date.now() / 1000),
          hasEncryptedIdentity: Boolean(encryptedBundle),
        };
        try {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem('rethink_real_sessions') || '[]';
            const existing = JSON.parse(raw);
            if (Array.isArray(existing)) {
              const idx = existing.findIndex((s: any) => s.sessionId === currentSessionId);
              if (idx >= 0) existing[idx] = localSessionRecord;
              else existing.unshift(localSessionRecord);
              localStorage.setItem('rethink_real_sessions', JSON.stringify(existing.slice(0, 50)));
            }
          }
        } catch {}

        apiFetch('/api/voice/session/persist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSessionId,
            duration,
            encrypted_payload: encryptedBundle,
            stage: stageReached,
            username: user?.userName || user?.displayName || 'student_user',
            transcript_text: transcriptText,
          }),
        })
          .then(async (res) => {
            if (res && res.ok) {
              const data: any = await res.json();
              if (data?.report) {
                setLatestReport(data.report);
              }
            }
          })
          .catch((e) => {
            console.warn('[VoiceSession] 后台持久化同步异常:', e);
          });
      } catch (err) {
        console.error('[VoiceSession] 报告生成或加密异常:', err);
      }
    }
  }, [stopVisualizer, setHookState, setSessionStatus, setDuplexPhase, user, setLatestReport, setReportModalOpen, addDialogueTurn]);
  endCallRef.current = endCall;

  const interrupt = useCallback(() => {
    const playedMs = audioGraphRef.current ? audioGraphRef.current.getPlaybackDurationMs() : 0;
    if (audioGraphRef.current) {
      audioGraphRef.current.stopPlayback(150);
    }
    if (clientRef.current) {
      clientRef.current.updateTurnDetection('listening');
      const itemId = clientRef.current.getCurrentResponseItemId();
      clientRef.current.interrupt({
        itemId: itemId || undefined,
        audioEndMs: playedMs,
      });
    }
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
  }, [setDuplexPhase, addDialogueTurn]);

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

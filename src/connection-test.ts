/**
 * WebRTC 연결 테스트 (같은 페이지 내 두 PeerConnection으로 시그널링 없이 검증)
 * - Coturn(TURN) / STUN 설정 사용
 * - 연결 과정 전체를 이벤트/상태로 수집해 UI에 노출
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  time: string;
  level: LogLevel;
  label: string;
  message: string;
  detail?: string;
}

export interface ConnectionStateSnapshot {
  role: 'offerer' | 'answerer';
  connectionState: string;
  iceConnectionState: string;
  iceGatheringState: string;
  signalingState: string;
  timestamp: string;
}

export type StateListener = (states: { offerer: ConnectionStateSnapshot; answerer: ConnectionStateSnapshot }) => void;
export type LogListener = (entry: LogEntry) => void;

const now = () => new Date().toISOString().slice(11, 23);

function formatCandidateType(type: string): string {
  const map: Record<string, string> = {
    host: '로컬(host)',
    srflx: 'STUN(srflx)',
    prflx: '피어 리플렉시브(prflx)',
    relay: 'TURN(relay)',
  };
  return map[type] ?? type;
}

export function buildIceServers(turnUrl: string, username: string, credential: string): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const envTurn = typeof import.meta.env !== 'undefined' && (import.meta.env as any).VITE_WEBRTC_TURN;
  const url = turnUrl?.trim() || envTurn || '';

  if (url) {
    servers.push({
      urls: url,
      username: username || undefined,
      credential: credential || undefined,
    });
  }
  servers.push({ urls: 'stun:stun.l.google.com:19302' });
  servers.push({ urls: 'stun:stun1.l.google.com:19302' });
  servers.push({ urls: 'stun:stun2.l.google.com:19302' });
  return servers;
}

export interface TestConfig {
  turnUrl: string;
  turnUsername: string;
  turnCredential: string;
}

export interface ConnectionTestResult {
  success: boolean;
  durationMs: number;
  offererFinalState: ConnectionStateSnapshot;
  answererFinalState: ConnectionStateSnapshot;
  selectedCandidatePair?: { local: string; remote: string; localType?: string; remoteType?: string };
  error?: string;
}

export async function runConnectionTest(
  config: TestConfig,
  onLog: LogListener,
  onState: StateListener
): Promise<ConnectionTestResult> {
  const log = (level: LogLevel, label: string, message: string, detail?: string) => {
    onLog({ time: now(), level, label, message, detail });
  };

  const iceServers = buildIceServers(config.turnUrl, config.turnUsername, config.turnCredential);
  const rtcConfig: RTCConfiguration = { iceServers };

  log('info', '설정', 'ICE 서버 구성', JSON.stringify(iceServers.map(s => ({ urls: s.urls, username: s.username ? '***' : undefined })), null, 2));

  const offererState: ConnectionStateSnapshot = {
    role: 'offerer',
    connectionState: 'new',
    iceConnectionState: 'new',
    iceGatheringState: 'new',
    signalingState: 'stable',
    timestamp: now(),
  };
  const answererState: ConnectionStateSnapshot = {
    role: 'answerer',
    connectionState: 'new',
    iceConnectionState: 'new',
    iceGatheringState: 'new',
    signalingState: 'stable',
    timestamp: now(),
  };

  const emitState = () => onState({ offerer: { ...offererState }, answerer: { ...answererState } });

  const updateOffererState = (pc: RTCPeerConnection) => {
    offererState.connectionState = pc.connectionState;
    offererState.iceConnectionState = pc.iceConnectionState;
    offererState.iceGatheringState = pc.iceGatheringState;
    offererState.signalingState = pc.signalingState;
    offererState.timestamp = now();
    emitState();
  };
  const updateAnswererState = (pc: RTCPeerConnection) => {
    answererState.connectionState = pc.connectionState;
    answererState.iceConnectionState = pc.iceConnectionState;
    answererState.iceGatheringState = pc.iceGatheringState;
    answererState.signalingState = pc.signalingState;
    answererState.timestamp = now();
    emitState();
  };

  const start = Date.now();
  let pcOfferer: RTCPeerConnection | null = null;
  let pcAnswerer: RTCPeerConnection | null = null;

  try {
    // ----- Offerer (PC1) -----
    log('info', 'Offerer', 'RTCPeerConnection 생성');
    pcOfferer = new RTCPeerConnection(rtcConfig);

    pcOfferer.onconnectionstatechange = () => {
      updateOffererState(pcOfferer!);
      log('info', 'Offerer', `connectionState: ${pcOfferer!.connectionState}`);
    };
    pcOfferer.oniceconnectionstatechange = () => {
      updateOffererState(pcOfferer!);
      log('info', 'Offerer', `iceConnectionState: ${pcOfferer!.iceConnectionState}`);
    };
    pcOfferer.onicegatheringstatechange = () => {
      updateOffererState(pcOfferer!);
      log('info', 'Offerer', `iceGatheringState: ${pcOfferer!.iceGatheringState}`);
    };
    pcOfferer.onicecandidate = (e) => {
      if (e.candidate) {
        log('info', 'Offerer', `ICE candidate 수집: ${formatCandidateType(e.candidate.type)}`, e.candidate.candidate?.slice(0, 80));
        pcAnswerer?.addIceCandidate(e.candidate).catch((err) => log('error', 'Answerer', 'addIceCandidate(offerer) 실패', String(err)));
      } else {
        log('info', 'Offerer', 'ICE candidate 수집 완료 (end-of-candidates)');
      }
    };

    const dc = pcOfferer.createDataChannel('test', { ordered: true });
    dc.onopen = () => log('success', 'Offerer', 'DataChannel 열림');
    dc.onclose = () => log('info', 'Offerer', 'DataChannel 닫힘');

    log('info', 'Offerer', 'createOffer() 호출');
    const offer = await pcOfferer.createOffer();
    await pcOfferer.setLocalDescription(offer);
    log('info', 'Offerer', 'setLocalDescription(offer) 완료');

    // ICE 수집 완료 대기 (선택적, 더 빠른 테스트를 위해 짧게)
    await new Promise<void>((resolve) => {
      if (pcOfferer!.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const done = () => {
        pcOfferer!.removeEventListener('icegatheringstatechange', done);
        resolve();
      };
      pcOfferer!.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, 3000);
    });

    const offerSdp = pcOfferer.localDescription!;
    log('info', '시그널링', 'Offer SDP → Answerer로 전달 (동일 페이지)');

    // ----- Answerer (PC2) -----
    log('info', 'Answerer', 'RTCPeerConnection 생성');
    pcAnswerer = new RTCPeerConnection(rtcConfig);

    pcAnswerer.onconnectionstatechange = () => {
      updateAnswererState(pcAnswerer!);
      log('info', 'Answerer', `connectionState: ${pcAnswerer!.connectionState}`);
    };
    pcAnswerer.oniceconnectionstatechange = () => {
      updateAnswererState(pcAnswerer!);
      log('info', 'Answerer', `iceConnectionState: ${pcAnswerer!.iceConnectionState}`);
    };
    pcAnswerer.onicegatheringstatechange = () => {
      updateAnswererState(pcAnswerer!);
      log('info', 'Answerer', `iceGatheringState: ${pcAnswerer!.iceGatheringState}`);
    };
    pcAnswerer.onicecandidate = (e) => {
      if (e.candidate) {
        log('info', 'Answerer', `ICE candidate 수집: ${formatCandidateType(e.candidate.type)}`, e.candidate.candidate?.slice(0, 80));
        pcOfferer?.addIceCandidate(e.candidate).catch((err) => log('error', 'Offerer', 'addIceCandidate 실패', String(err)));
      } else {
        log('info', 'Answerer', 'ICE candidate 수집 완료 (end-of-candidates)');
      }
    };
    pcAnswerer.ondatachannel = (e) => {
      const ch = e.channel;
      log('info', 'Answerer', 'DataChannel 수신');
      ch.onopen = () => log('success', 'Answerer', 'DataChannel 열림');
      ch.onclose = () => log('info', 'Answerer', 'DataChannel 닫힘');
    };

    await pcAnswerer.setRemoteDescription(new RTCSessionDescription(offerSdp as RTCSessionDescriptionInit));
    log('info', 'Answerer', 'setRemoteDescription(offer) 완료');

    log('info', 'Answerer', 'createAnswer() 호출');
    const answer = await pcAnswerer.createAnswer();
    await pcAnswerer.setLocalDescription(answer);
    log('info', 'Answerer', 'setLocalDescription(answer) 완료');

    const answerSdp = pcAnswerer.localDescription!;
    await pcOfferer.setRemoteDescription(new RTCSessionDescription(answerSdp as RTCSessionDescriptionInit));
    log('info', 'Offerer', 'setRemoteDescription(answer) 완료');

    // Answerer가 수집한 ICE 후보들을 Offerer에 전달 (이미 onicecandidate에서 처리됨)
    // 연결 완료 대기
    const connected = await Promise.race([
      new Promise<boolean>((resolve) => {
        const check = () => {
          if (pcOfferer?.iceConnectionState === 'connected' || pcOfferer?.iceConnectionState === 'completed') {
            resolve(true);
            return true;
          }
          if (pcOfferer?.iceConnectionState === 'failed' || pcAnswerer?.iceConnectionState === 'failed') {
            resolve(false);
            return true;
          }
          return false;
        };
        if (check()) return;
        pcOfferer?.addEventListener('iceconnectionstatechange', function handler() {
          if (check()) {
            pcOfferer?.removeEventListener('iceconnectionstatechange', handler);
            pcAnswerer?.removeEventListener('iceconnectionstatechange', handler);
          }
        });
        pcAnswerer?.addEventListener('iceconnectionstatechange', function handler() {
          if (check()) {
            pcOfferer?.removeEventListener('iceconnectionstatechange', handler);
            pcAnswerer?.removeEventListener('iceconnectionstatechange', handler);
          }
        });
        setTimeout(() => resolve(pcOfferer?.iceConnectionState === 'connected' || pcOfferer?.iceConnectionState === 'completed'), 15000);
      }),
    ]);

    const durationMs = Date.now() - start;

    let selectedCandidatePair: ConnectionTestResult['selectedCandidatePair'];
    try {
      const stats = await pcOfferer.getStats();
      for (const report of stats.values()) {
        if (report.type === 'candidate-pair' && (report as RTCIceCandidatePairStats).state === 'succeeded') {
          const pair = report as RTCIceCandidatePairStats;
          const all = await pcOfferer.getStats();
          const localCand = all.get(pair.localCandidateId);
          const remoteCand = all.get(pair.remoteCandidateId);
          selectedCandidatePair = {
            local: pair.localCandidateId,
            remote: pair.remoteCandidateId,
            localType: localCand && 'candidateType' in localCand ? (localCand as any).candidateType : undefined,
            remoteType: remoteCand && 'candidateType' in remoteCand ? (remoteCand as any).candidateType : undefined,
          };
          break;
        }
      }
    } catch (_) {}

    if (connected) {
      log('success', '결과', `연결 성공 (${durationMs}ms)`);
      if (selectedCandidatePair) {
        log('info', '결과', `선택된 후보: local=${selectedCandidatePair.localType ?? '-'} / remote=${selectedCandidatePair.remoteType ?? '-'}`);
      }
    } else {
      log('error', '결과', `연결 실패 또는 시간 초과 (${durationMs}ms)`);
    }

    // 정리
    pcOfferer.close();
    pcAnswerer.close();
    pcOfferer = null;
    pcAnswerer = null;
    offererState.connectionState = 'closed';
    offererState.iceConnectionState = 'closed';
    offererState.iceGatheringState = 'complete';
    offererState.signalingState = 'closed';
    answererState.connectionState = 'closed';
    answererState.iceConnectionState = 'closed';
    answererState.iceGatheringState = 'complete';
    answererState.signalingState = 'closed';
    emitState();

    return {
      success: connected,
      durationMs,
      offererFinalState: { ...offererState },
      answererFinalState: { ...answererState },
      selectedCandidatePair,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', '테스트', '예외 발생', message);
    pcOfferer?.close();
    pcAnswerer?.close();
    return {
      success: false,
      durationMs: Date.now() - start,
      offererFinalState: offererState,
      answererFinalState: answererState,
      error: message,
    };
  }
}

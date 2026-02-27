/**
 * Launcher와 동일한 ICE(TURN/STUN) 설정
 */

export interface IceConfig {
  turnUrl: string;
  turnUsername: string;
  turnCredential: string;
}

export function buildIceServers(config: IceConfig): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const envTurn = typeof import.meta.env !== 'undefined' && (import.meta.env as { VITE_WEBRTC_TURN?: string }).VITE_WEBRTC_TURN;
  const url = (config.turnUrl || '').trim() || envTurn || '';

  if (url) {
    servers.push({
      urls: url,
      username: config.turnUsername || undefined,
      credential: config.turnCredential || undefined,
    });
  }
  servers.push({ urls: 'stun:stun.l.google.com:19302' });
  servers.push({ urls: 'stun:stun1.l.google.com:19302' });
  servers.push({ urls: 'stun:stun2.l.google.com:19302' });
  return servers;
}

export function getRtcConfiguration(config: IceConfig): RTCConfiguration {
  return { iceServers: buildIceServers(config) };
}

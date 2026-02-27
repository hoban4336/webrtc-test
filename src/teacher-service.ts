/**
 * 교사용 WebRTC 서비스 (launcher teacher-webrtc.service와 동일 흐름)
 * - startServer() → 학생에게 webrtc-server-started 브로드캐스트
 * - handleOffer(studentUuid, offer) → Answer 생성 후 sendMsgToUser(webrtc-answer), ICE는 onicecandidate에서 sendMsgToUser(webrtc-ice-candidate)
 */

import * as signaling from './signaling';
import type { IceConfig } from './webrtc-config';
import { getRtcConfiguration } from './webrtc-config';

export interface WebRTCConnectionInfo {
  connectionId: string;
  userId: string;
  userType: string;
  connectedAt: Date;
  connectionState?: string;
  iceConnectionState?: string;
  dataChannelState?: string;
}

type GetConfig = () => IceConfig;

export function createTeacherService(getConfig: GetConfig) {
  const peerConnections = new Map<string, { connection: RTCPeerConnection; dataChannel: RTCDataChannel | null; connectionInfo: WebRTCConnectionInfo }>();
  let isServerStarted = false;

  const updateConnectionInfo = (studentUuid: string) => {
    const entry = peerConnections.get(studentUuid);
    if (!entry) return;
    entry.connectionInfo.connectionState = entry.connection.connectionState;
    entry.connectionInfo.iceConnectionState = entry.connection.iceConnectionState;
    entry.connectionInfo.dataChannelState = entry.dataChannel?.readyState;
  };

  return {
    isServerStarted: () => isServerStarted,

    getConnectedConnectionInfo: (): WebRTCConnectionInfo[] => {
      return Array.from(peerConnections.values())
        .filter((pc) => pc.connection.iceConnectionState === 'connected' || pc.connection.iceConnectionState === 'completed')
        .map((pc) => pc.connectionInfo);
    },

    getAllConnectionInfo: (): WebRTCConnectionInfo[] => {
      return Array.from(peerConnections.values()).map((pc) => pc.connectionInfo);
    },

    async startServer(): Promise<void> {
      if (isServerStarted) return;
      isServerStarted = true;
      signaling.broadcastMsgToStudents({
        action: 'webrtc-server-started',
        payload: { message: 'WebRTC 서버가 시작되었습니다.' },
      });
    },

    async stopServer(): Promise<void> {
      for (const [uuid] of peerConnections) {
        await this.closeConnection(uuid);
      }
      peerConnections.clear();
      isServerStarted = false;
      signaling.broadcastMsgToStudents({
        action: 'webrtc-server-stopped',
        payload: { message: 'WebRTC 서버가 종료되었습니다.' },
      });
    },

    async closeConnection(studentUuid: string): Promise<void> {
      const entry = peerConnections.get(studentUuid);
      if (!entry) return;
      try {
        if (entry.dataChannel) {
          entry.dataChannel.onopen = null;
          entry.dataChannel.onmessage = null;
          entry.dataChannel.onclose = null;
          entry.dataChannel.onerror = null;
          if (entry.dataChannel.readyState === 'open' || entry.dataChannel.readyState === 'connecting') {
            entry.dataChannel.close();
          }
        }
        entry.connection.onicecandidate = null;
        entry.connection.onicegatheringstatechange = null;
        entry.connection.onconnectionstatechange = null;
        entry.connection.oniceconnectionstatechange = null;
        entry.connection.ondatachannel = null;
        entry.connection.close();
      } finally {
        peerConnections.delete(studentUuid);
      }
    },

    async handleOffer(studentUuid: string, offer: RTCSessionDescriptionInit): Promise<void> {
      const config = getRtcConfiguration(getConfig());
      const peerConnection = new RTCPeerConnection(config);
      let dataChannel: RTCDataChannel | null = null;

      peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = () => updateConnectionInfo(studentUuid);
        dataChannel.onclose = () => updateConnectionInfo(studentUuid);
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          signaling.sendMsgToUser(
            { action: 'webrtc-ice-candidate', payload: { candidate: event.candidate.toJSON() } },
            studentUuid
          );
        }
      };

      peerConnection.onconnectionstatechange = () => updateConnectionInfo(studentUuid);
      peerConnection.oniceconnectionstatechange = () => updateConnectionInfo(studentUuid);

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      const connectionInfo: WebRTCConnectionInfo = {
        connectionId: `teacher-${studentUuid}`,
        userId: studentUuid,
        userType: 'student',
        connectedAt: new Date(),
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      };

      peerConnections.set(studentUuid, {
        connection: peerConnection,
        dataChannel,
        connectionInfo,
      });

      signaling.sendMsgToUser(
        { action: 'webrtc-answer', payload: { answer } },
        studentUuid
      );
    },

    async handleIceCandidate(studentUuid: string, candidate: RTCIceCandidateInit): Promise<void> {
      const entry = peerConnections.get(studentUuid);
      if (entry?.connection) {
        await entry.connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    },
  };
}

export type TeacherService = ReturnType<typeof createTeacherService>;

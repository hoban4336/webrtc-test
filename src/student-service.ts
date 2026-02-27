/**
 * 학생용 WebRTC 서비스 (launcher student-webrtc.service와 동일 흐름)
 * - connectToTeacher(teacherUuid) → createDataChannel('studentChannel', { ordered: true }), createOffer, sendMsgToUser(webrtc-offer)
 * - handleAnswer(answer) → setRemoteDescription
 * - handleIceCandidate(candidate) → addIceCandidate
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

export function createStudentService(getConfig: GetConfig) {
  let peerConnection: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let teacherUuid: string | null = null;
  let connectionInfo: WebRTCConnectionInfo | null = null;

  const updateConnectionInfo = () => {
    if (connectionInfo && peerConnection) {
      connectionInfo.connectionState = peerConnection.connectionState;
      connectionInfo.iceConnectionState = peerConnection.iceConnectionState;
      connectionInfo.dataChannelState = dataChannel?.readyState;
    }
  };

  return {
    getIsConnected: (): boolean => {
      return !!(
        peerConnection?.iceConnectionState === 'connected' ||
        peerConnection?.iceConnectionState === 'completed'
      ) && !!dataChannel && dataChannel.readyState === 'open';
    },

    getConnectionInfo: (): WebRTCConnectionInfo | null => connectionInfo,

    async connectToTeacher(teacherUuidParam: string): Promise<void> {
      if (peerConnection) return;
      teacherUuid = teacherUuidParam;
      const config = getRtcConfiguration(getConfig());
      peerConnection = new RTCPeerConnection(config);
      dataChannel = peerConnection.createDataChannel('studentChannel', { ordered: true });

      dataChannel.onopen = () => updateConnectionInfo();
      dataChannel.onclose = () => updateConnectionInfo();

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && teacherUuid) {
          signaling.sendMsgToUser(
            { action: 'webrtc-ice-candidate', payload: { candidate: event.candidate.toJSON() } },
            teacherUuid
          );
        }
      };

      peerConnection.onconnectionstatechange = () => updateConnectionInfo();
      peerConnection.oniceconnectionstatechange = () => updateConnectionInfo();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      connectionInfo = {
        connectionId: `student-${teacherUuidParam}`,
        userId: 'student-test',
        userType: 'student',
        connectedAt: new Date(),
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      };

      signaling.sendMsgToUser(
        {
          action: 'webrtc-offer',
          payload: { offer, studentUuid: signaling.STUDENT_ID },
        },
        teacherUuid
      );
    },

    async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
      if (!peerConnection) return;
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      updateConnectionInfo();
    },

    async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    },

    disconnect(): void {
      try {
        if (dataChannel) {
          dataChannel.onopen = null;
          dataChannel.onmessage = null;
          dataChannel.onclose = null;
          dataChannel.onerror = null;
          if (dataChannel.readyState === 'open' || dataChannel.readyState === 'connecting') {
            dataChannel.close();
          }
          dataChannel = null;
        }
        if (peerConnection) {
          peerConnection.onicecandidate = null;
          peerConnection.onconnectionstatechange = null;
          peerConnection.oniceconnectionstatechange = null;
          peerConnection.close();
          peerConnection = null;
        }
      } finally {
        teacherUuid = null;
        connectionInfo = null;
      }
    },
  };
}

export type StudentService = ReturnType<typeof createStudentService>;

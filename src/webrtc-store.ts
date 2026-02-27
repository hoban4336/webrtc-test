/**
 * WebRTC Store (launcher webrtc.store와 동일 역할)
 * - 교사: startTeacherServer, stopTeacherServer, handleStudentOffer, handleStudentIceCandidate
 * - 학생: connectToTeacher, disconnectFromTeacher, handleTeacherAnswer, handleTeacherIceCandidate
 * - 상태: isServerStarted, connectedStudents, isConnectedToTeacher, teacherConnectionInfo
 */

import * as signaling from './signaling';
import { createTeacherService, type TeacherService, type WebRTCConnectionInfo } from './teacher-service';
import { createStudentService, type StudentService } from './student-service';
import type { IceConfig } from './webrtc-config';

export type LogEntry = { time: string; role: 'teacher' | 'student' | 'signaling'; level: 'info' | 'warn' | 'error' | 'success'; message: string; detail?: string };
export type LogListener = (entry: LogEntry) => void;

const now = () => new Date().toISOString().slice(11, 23);

export function createWebRTCStore(getConfig: () => IceConfig, onLog: LogListener) {
  const log = (role: LogEntry['role'], level: LogEntry['level'], message: string, detail?: string) => {
    onLog({ time: now(), role, level, message, detail });
  };

  const teacherService: TeacherService = createTeacherService(getConfig);
  const studentService: StudentService = createStudentService(getConfig);

  let isServerStarted = false;
  let connectedStudents: WebRTCConnectionInfo[] = [];
  let isConnectedToTeacher = false;
  let teacherConnectionInfo: WebRTCConnectionInfo | null = null;

  const updateConnectionStatus = () => {
    isServerStarted = teacherService.isServerStarted();
    connectedStudents = teacherService.getConnectedConnectionInfo();
    isConnectedToTeacher = studentService.getIsConnected();
    teacherConnectionInfo = studentService.getConnectionInfo();
  };

  // 교사 메시지 핸들러 (학생 → 교사)
  const handleTeacherMessage = async (action: string, payload: any, fromUuid: string) => {
    log('signaling', 'info', `교사 수신: ${action}`, `from=${fromUuid}`);
    try {
      switch (action) {
        case 'webrtc-offer': {
          const offer = payload?.offer;
          if (offer) {
            log('teacher', 'info', 'Offer 수신, handleOffer 호출');
            await teacherService.handleOffer(fromUuid, offer);
            updateConnectionStatus();
          }
          break;
        }
        case 'webrtc-ice-candidate': {
          const candidate = payload?.candidate;
          if (candidate) {
            await teacherService.handleIceCandidate(fromUuid, candidate);
          }
          break;
        }
        default:
          log('teacher', 'info', `미처리 액션: ${action}`);
      }
    } catch (e) {
      log('teacher', 'error', '처리 오류', String(e));
    }
    updateConnectionStatus();
  };

  // 학생 메시지 핸들러 (교사 → 학생)
  const handleStudentMessage = async (action: string, payload: any) => {
    log('signaling', 'info', `학생 수신: ${action}`);
    try {
      switch (action) {
        case 'webrtc-server-started':
          log('student', 'info', 'webrtc-server-started 수신 (서버 시작 알림)');
          break;
        case 'webrtc-server-stopped':
          log('student', 'info', 'webrtc-server-stopped 수신');
          studentService.disconnect();
          updateConnectionStatus();
          break;
        case 'webrtc-answer': {
          const answer = payload?.answer;
          if (answer) {
            log('student', 'info', 'Answer 수신, handleAnswer 호출');
            await studentService.handleAnswer(answer);
            updateConnectionStatus();
          }
          break;
        }
        case 'webrtc-ice-candidate': {
          const candidate = payload?.candidate;
          if (candidate) {
            await studentService.handleIceCandidate(candidate);
          }
          break;
        }
        case 'webrtc-connection-rejected':
          log('student', 'error', '연결 거부됨', payload?.message);
          studentService.disconnect();
          updateConnectionStatus();
          break;
        default:
          log('student', 'info', `미처리 액션: ${action}`);
      }
    } catch (e) {
      log('student', 'error', '처리 오류', String(e));
    }
    updateConnectionStatus();
  };

  signaling.setTeacherMessageHandler(handleTeacherMessage);
  signaling.setStudentMessageHandler(handleStudentMessage);

  return {
    getState: () => ({
      isServerStarted,
      connectedStudents: [...connectedStudents],
      isConnectedToTeacher,
      teacherConnectionInfo: teacherConnectionInfo ? { ...teacherConnectionInfo } : null,
    }),

    updateConnectionStatus,

    async startTeacherServer() {
      log('teacher', 'info', 'WebRTC 서버 시작 요청');
      await teacherService.startServer();
      isServerStarted = true;
      log('teacher', 'success', 'WebRTC 서버 시작 완료');
      updateConnectionStatus();
    },

    async stopTeacherServer() {
      log('teacher', 'info', 'WebRTC 서버 종료 요청');
      await teacherService.stopServer();
      isServerStarted = false;
      connectedStudents = [];
      log('teacher', 'info', 'WebRTC 서버 종료 완료');
      updateConnectionStatus();
    },

    async connectToTeacher(teacherUuid: string) {
      log('student', 'info', '교사에게 연결 요청', `teacherUuid=${teacherUuid}`);
      await studentService.connectToTeacher(teacherUuid);
      log('student', 'info', 'Offer 전송 완료, Answer 대기 중');
      updateConnectionStatus();
    },

    disconnectFromTeacher() {
      log('student', 'info', '연결 해제 요청');
      studentService.disconnect();
      isConnectedToTeacher = false;
      teacherConnectionInfo = null;
      updateConnectionStatus();
    },
  };
}

export type WebRTCStore = ReturnType<typeof createWebRTCStore>;

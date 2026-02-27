/**
 * Launcher의 WebSocket 시그널링을 시뮬레이션 (같은 페이지 내 교사↔학생 메시지 전달)
 * - sendMsgToUser(msg, targetUuid) → 상대측 핸들러 호출
 * - broadcastMsgToStudents(msg) → 학생측 핸들러 호출
 */

export const TEACHER_ID = 'teacher-1';
export const STUDENT_ID = 'student-1';

export interface SignalingMessage {
  action: string;
  payload?: Record<string, unknown>;
}

export type MessageHandler = (action: string, payload: unknown, fromUuid: string) => void | Promise<void>;

let teacherHandler: MessageHandler | null = null;
let studentHandler: MessageHandler | null = null;

/** 교사가 받는 메시지 핸들러 등록 (학생 → 교사) */
export function setTeacherMessageHandler(handler: MessageHandler | null): void {
  teacherHandler = handler;
}

/** 학생이 받는 메시지 핸들러 등록 (교사 → 학생) */
export function setStudentMessageHandler(handler: MessageHandler | null): void {
  studentHandler = handler;
}

/** Launcher의 sendMsgToUser 시뮬레이션: 특정 사용자에게 메시지 전송 */
export function sendMsgToUser(msg: SignalingMessage, targetUuid: string): void {
  const { action, payload = {} } = msg;
  if (targetUuid === STUDENT_ID && studentHandler) {
    Promise.resolve(studentHandler(action, payload, TEACHER_ID)).catch((e) =>
      console.error('[Signaling] student handler error', e)
    );
  } else if (targetUuid === TEACHER_ID && teacherHandler) {
    Promise.resolve(teacherHandler(action, payload, STUDENT_ID)).catch((e) =>
      console.error('[Signaling] teacher handler error', e)
    );
  }
}

/** Launcher의 broadcastMsgToStudents 시뮬레이션: 모든 학생에게 전송 */
export function broadcastMsgToStudents(msg: SignalingMessage): void {
  sendMsgToUser(msg, STUDENT_ID);
}

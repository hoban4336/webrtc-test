/**
 * WebRTC Connection Test - Launcher와 동일 흐름
 * - 교사: 서버 시작 → Offer 수신 → Answer/ICE 전송
 * - 학생: 교사에게 연결 → Offer 전송 → Answer/ICE 수신
 * - 시그널링: 같은 페이지 내 mock (sendMsgToUser / broadcastMsgToStudents)
 */

import * as signaling from './signaling';
import { createWebRTCStore, type LogEntry, type WebRTCStore } from './webrtc-store';
import type { IceConfig } from './webrtc-config';

const TEACHER_ID = signaling.TEACHER_ID;
const STUDENT_ID = signaling.STUDENT_ID;

let store: WebRTCStore;
let iceConfig: IceConfig = {
  turnUrl: '',
  turnUsername: 'admin',
  turnCredential: '',
};

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>WebRTC Connection Test (Launcher 동일 흐름)</h1>
        <p class="subtitle">교사 패널에서 서버 시작 → 학생 패널에서 교사에게 연결. Offer/Answer/ICE는 시그널링으로 자동 교환.</p>
      </header>

      <section class="config card">
        <h2>ICE 서버 설정 (TURN/Coturn)</h2>
        <div class="form-row">
          <label>TURN URL</label>
          <input type="text" id="turnUrl" placeholder="turn:your-coturn:3478" />
        </div>
        <div class="form-row">
          <label>TURN 사용자명</label>
          <input type="text" id="turnUsername" value="admin" />
        </div>
        <div class="form-row">
          <label>TURN 비밀번호</label>
          <input type="password" id="turnCredential" placeholder="비밀번호" />
        </div>
      </section>

      <section class="panels">
        <div class="panel card teacher-panel">
          <h2>교사 (Teacher)</h2>
          <div class="panel-actions">
            <button type="button" id="btnTeacherStart" class="btn btn-primary">WebRTC 서버 시작</button>
            <button type="button" id="btnTeacherStop" class="btn btn-secondary">WebRTC 서버 종료</button>
          </div>
          <div class="panel-status">
            <span class="status-dot" id="teacherStatusDot"></span>
            <span id="teacherStatusText">서버 중지됨</span>
            <span id="teacherConnectedCount"></span>
          </div>
          <div class="connection-list" id="teacherConnectionList">
            <p class="muted">연결된 학생이 없습니다.</p>
          </div>
        </div>

        <div class="panel card student-panel">
          <h2>학생 (Student)</h2>
          <div class="form-row">
            <label>교사 UUID</label>
            <input type="text" id="teacherUuid" value="${TEACHER_ID}" readonly />
          </div>
          <div class="panel-actions">
            <button type="button" id="btnStudentConnect" class="btn btn-primary">교사에게 연결</button>
            <button type="button" id="btnStudentDisconnect" class="btn btn-secondary">연결 해제</button>
          </div>
          <div class="panel-status">
            <span class="status-dot" id="studentStatusDot"></span>
            <span id="studentStatusText">연결 안됨</span>
          </div>
          <div class="connection-info" id="studentConnectionInfo">
            <p class="muted">연결 정보 없음</p>
          </div>
        </div>
      </section>

      <section class="log card">
        <h2>연결 과정 로그 (시그널링 + 교사/학생 처리)</h2>
        <div class="log-toolbar"><span id="logCount">0건</span> <button type="button" id="btnClearLog" class="btn btn-small">지우기</button></div>
        <div class="log-list" id="logList"></div>
      </section>
    </div>
  `;
}

function bind(store: WebRTCStore) {
  const logList = document.getElementById('logList')!;
  const logCount = document.getElementById('logCount')!;

  function addLog(entry: LogEntry) {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.role} log-${entry.level}`;
    const detail = entry.detail ? ` <span class="log-detail">${escapeHtml(entry.detail)}</span>` : '';
    div.innerHTML = `<span class="log-time">${escapeHtml(entry.time)}</span> <span class="log-role">[${entry.role}]</span> ${escapeHtml(entry.message)}${detail}`;
    logList.appendChild(div);
    logList.scrollTop = logList.scrollHeight;
    const n = logList.querySelectorAll('.log-entry').length;
    logCount.textContent = `${n}건`;
  }

  function refreshConfig() {
    iceConfig = {
      turnUrl: (document.getElementById('turnUrl') as HTMLInputElement).value.trim(),
      turnUsername: (document.getElementById('turnUsername') as HTMLInputElement).value.trim(),
      turnCredential: (document.getElementById('turnCredential') as HTMLInputElement).value,
    };
  }

  function updateUI() {
    refreshConfig();
    const state = store.getState();

    const teacherDot = document.getElementById('teacherStatusDot')!;
    const teacherText = document.getElementById('teacherStatusText')!;
    const teacherCount = document.getElementById('teacherConnectedCount')!;
    if (state.isServerStarted) {
      teacherDot.className = 'status-dot on';
      teacherText.textContent = 'WebRTC 서버 실행 중';
      teacherCount.textContent = ` | 연결된 학생: ${state.connectedStudents.length}명`;
    } else {
      teacherDot.className = 'status-dot';
      teacherText.textContent = 'WebRTC 서버 중지됨';
      teacherCount.textContent = '';
    }

    const listEl = document.getElementById('teacherConnectionList')!;
    if (state.connectedStudents.length > 0) {
      listEl.innerHTML = state.connectedStudents
        .map(
          (s) => `
        <div class="connection-item">
          <div><strong>${escapeHtml(s.userId)}</strong></div>
          <div class="detail">connectionState: ${s.connectionState} | iceConnectionState: ${s.iceConnectionState} | dataChannel: ${s.dataChannelState || '-'}</div>
          <div class="detail">연결 시각: ${s.connectedAt ? new Date(s.connectedAt).toLocaleTimeString() : '-'}</div>
        </div>
      `
        )
        .join('');
    } else {
      listEl.innerHTML = '<p class="muted">연결된 학생이 없습니다.</p>';
    }

    const studentDot = document.getElementById('studentStatusDot')!;
    const studentText = document.getElementById('studentStatusText')!;
    const studentInfo = document.getElementById('studentConnectionInfo')!;
    if (state.isConnectedToTeacher && state.teacherConnectionInfo) {
      studentDot.className = 'status-dot on';
      studentText.textContent = '교사와 WebRTC 연결됨';
      const c = state.teacherConnectionInfo;
      studentInfo.innerHTML = `
        <div class="connection-item">
          <div>connectionId: ${escapeHtml(c.connectionId)}</div>
          <div class="detail">connectionState: ${c.connectionState} | iceConnectionState: ${c.iceConnectionState} | dataChannel: ${c.dataChannelState || '-'}</div>
          <div class="detail">연결 시각: ${c.connectedAt ? new Date(c.connectedAt).toLocaleTimeString() : '-'}</div>
        </div>
      `;
    } else {
      studentDot.className = 'status-dot';
      studentText.textContent = 'WebRTC 연결 안됨';
      studentInfo.innerHTML = '<p class="muted">연결 정보 없음</p>';
    }
  }

  document.getElementById('btnTeacherStart')!.addEventListener('click', async () => {
    refreshConfig();
    await store.startTeacherServer();
    updateUI();
  });

  document.getElementById('btnTeacherStop')!.addEventListener('click', async () => {
    await store.stopTeacherServer();
    updateUI();
  });

  document.getElementById('btnStudentConnect')!.addEventListener('click', async () => {
    refreshConfig();
    const teacherUuid = (document.getElementById('teacherUuid') as HTMLInputElement).value.trim();
    if (!teacherUuid) return;
    await store.connectToTeacher(teacherUuid);
    updateUI();
  });

  document.getElementById('btnStudentDisconnect')!.addEventListener('click', () => {
    store.disconnectFromTeacher();
    updateUI();
  });

  document.getElementById('btnClearLog')!.addEventListener('click', () => {
    logList.innerHTML = '';
    logCount.textContent = '0건';
  });

  setInterval(() => {
    store.updateConnectionStatus();
    updateUI();
  }, 1000);

  updateUI();
}

function main() {
  const getConfig = (): IceConfig => iceConfig;
  store = createWebRTCStore(getConfig, (entry) => {
    const list = document.getElementById('logList');
    const count = document.getElementById('logCount');
    if (list && count) {
      const div = document.createElement('div');
      div.className = `log-entry log-${entry.role} log-${entry.level}`;
      const detail = entry.detail ? ` <span class="log-detail">${escapeHtml(entry.detail)}</span>` : '';
      div.innerHTML = `<span class="log-time">${escapeHtml(entry.time)}</span> <span class="log-role">[${entry.role}]</span> ${escapeHtml(entry.message)}${detail}`;
      list.appendChild(div);
      list.scrollTop = list.scrollHeight;
      count.textContent = `${list.querySelectorAll('.log-entry').length}건`;
    }
  });

  render();
  bind(store);
}

main();

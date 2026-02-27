# WebRTC Connection Test (Coturn)

**visang-aidt-launcher**와 **동일한 WebRTC 흐름**으로 연결을 검증하는 테스트 프로젝트입니다.  
교사(Teacher) 서버 시작 → 학생(Student)이 교사에게 연결 → Offer/Answer/ICE가 시그널링을 통해 교환되는 구조를 같은 페이지에서 시뮬레이션합니다.

## Launcher와 동일한 흐름

- **Store**: `webrtc.store`와 동일하게 `startTeacherServer`, `stopTeacherServer`, `connectToTeacher`, `disconnectFromTeacher`, `handleStudentOffer`, `handleTeacherAnswer`, ICE 처리
- **교사 서비스**: `teacher-webrtc.service`와 동일 — `startServer()` → `handleOffer(studentUuid, offer)` → Answer/ICE를 `sendMsgToUser`로 학생에게 전송
- **학생 서비스**: `student-webrtc.service`와 동일 — `connectToTeacher(teacherUuid)` → DataChannel 생성, Offer 전송 → `handleAnswer` / `handleIceCandidate`로 수신
- **시그널링**: Launcher의 WebSocket 대신 같은 페이지 내 **mock** (`sendMsgToUser`, `broadcastMsgToStudents`)으로 메시지 전달

## 기능

- **교사 패널**: WebRTC 서버 시작/종료, 서버 상태, 연결된 학생 목록(connectionState, iceConnectionState, dataChannelState)
- **학생 패널**: 교사 UUID 입력, 교사에게 연결/연결 해제, 연결 상태 및 연결 정보
- **ICE 설정**: TURN URL, 사용자명, 비밀번호 (Coturn과 동일하게 설정)
- **연결 과정 로그**: 시그널링 수신/전송, 교사·학생 측 처리 단계를 역할별로 표시

## 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 (기본 http://localhost:5174)
npm run dev

# 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## TURN(Coturn) 설정

1. **UI 입력**  
   페이지에서 TURN URL, 사용자명, 비밀번호를 입력한 뒤 **연결 테스트 시작**을 누르면 해당 설정으로 테스트합니다.

2. **환경 변수 (선택)**  
   프로젝트 루트에 `.env`를 만들고 다음처럼 넣으면, UI의 TURN URL이 비어 있을 때 이 값이 사용됩니다.

   ```env
   VITE_WEBRTC_TURN=turn:your-coturn-host:3478
   ```

   TURN 인증이 필요하면 UI에서 사용자명/비밀번호를 입력하면 됩니다.

## Coturn 서버 예시

- UDP: `turn:your-server:3478`
- TLS: `turns:your-server:5349`

Coturn 서버는 별도 설치·설정이 필요하며, 이 프로젝트는 **클라이언트 연결 테스트만** 수행합니다.

## 화면 구성

| 영역 | 설명 |
|------|------|
| ICE 서버 설정 | TURN URL, 사용자명, 비밀번호 입력 |
| 연결 상태 | Offerer(PC1) / Answerer(PC2) 각각의 상태 값 실시간 표시 |
| 연결 과정 로그 | 시간순 로그 (설정 → Offer/Answer → ICE 후보 → 결과) |
| 결과 줄 | 최종 성공/실패, 소요 시간, 선택된 후보 타입 |

이 프로젝트로 Coturn까지 포함한 WebRTC 연결이 정상적으로 수립되는지 빠르게 확인할 수 있습니다.

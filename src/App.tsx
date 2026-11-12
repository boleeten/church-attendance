import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminApp from "./admin/AdminApp";
import { remoteEnabled } from "./lib/remote";
import { syncAppBadge } from "./lib/push";
import { useData, useMe } from "./lib/store";
import type { Role } from "./lib/types";
import { AttendanceCheck } from "./mobile/Attendance";
import { EntrySelect, ForcedPassword, Login } from "./mobile/Auth";
import { History } from "./mobile/History";
import { afterLoginPath, homePath } from "./mobile/Shell";
import { HeadHome, MyInfo, Notifications, StudentDetail, StudentList, TeacherHome } from "./mobile/Teacher";
import { Toasts } from "./ui";
import { UpdateBanner } from "./lib/update";

/** 로그인·비밀번호 변경·역할을 확인한 뒤에만 화면을 보여 준다. */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const u = useMe();
  if (!u) return <Navigate to="/login" replace />;
  if (u.mustChangePassword) return <Navigate to="/password" replace />;
  if (!roles.some((r) => u.roles.includes(r))) return <Navigate to={homePath(u)} replace />;
  return <>{children}</>;
}

function Root() {
  const u = useMe();
  if (!u) return <Navigate to="/login" replace />;
  // 앱을 열 때(시작 주소 "/")도 들어갈 화면이 여러 개면 선택 화면을 보여 준다 (로그인이 유지된 경우 포함)
  return <Navigate to={u.mustChangePassword ? "/password" : afterLoginPath(u)} replace />;
}

export default function App() {
  const u = useMe();
  const d = useData();
  const unread = u ? d.notifications.filter((n) => n.userId === u.id && !n.read).length : 0;
  // 홈 화면 아이콘 숫자를 안 읽은 알림 수에 맞춘다 (모두 읽으면 숫자와 알림 센터의 알림을 지움)
  useEffect(() => {
    if (!u) return;
    void syncAppBadge(unread);
    // 앱을 다시 열어 화면에 돌아올 때도 맞춘다 (그 사이 푸시가 와서 숫자가 바뀌었을 수 있음)
    const onShow = () => document.visibilityState === "visible" && void syncAppBadge(unread);
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [u, unread]);
  const T = (el: ReactNode) => <Guard roles={["teacher", "head"]}>{el}</Guard>;
  const H = (el: ReactNode) => <Guard roles={["head"]}>{el}</Guard>;
  return (
    <BrowserRouter>
      {!remoteEnabled && <div className="demo-banner">데모 모드 · 예시 데이터이며 입력 내용은 이 브라우저에만 저장됩니다</div>}
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/select" element={u && !u.mustChangePassword ? <EntrySelect /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={u && !u.mustChangePassword ? <Navigate to={afterLoginPath(u)} replace /> : <Login />} />
        <Route path="/password" element={u ? <ForcedPassword /> : <Navigate to="/login" replace />} />
        <Route path="/t" element={T(<TeacherHome />)} />
        <Route path="/t/notifications" element={T(<Notifications base="/t" />)} />
        <Route path="/t/check" element={T(<AttendanceCheck mode="student" />)} />
        <Route path="/t/students" element={T(<StudentList />)} />
        <Route path="/t/students/:id" element={T(<StudentDetail />)} />
        <Route path="/t/history" element={T(<History mode="student" />)} />
        <Route path="/t/me" element={T(<MyInfo base="/t" />)} />
        <Route path="/h" element={H(<HeadHome />)} />
        <Route path="/h/notifications" element={H(<Notifications base="/h" />)} />
        <Route path="/h/check" element={H(<AttendanceCheck mode="teacher" />)} />
        <Route path="/h/history" element={H(<History mode="teacher" />)} />
        <Route path="/h/me" element={H(<MyInfo base="/h" />)} />
        <Route path="/admin/*" element={<Guard roles={["admin", "super"]}><AdminApp /></Guard>} />
        <Route path="*" element={<Root />} />
      </Routes>
      <Toasts />
      <UpdateBanner />
    </BrowserRouter>
  );
}

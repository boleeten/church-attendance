import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminApp from "./admin/AdminApp";
import { remoteEnabled } from "./lib/remote";
import { useMe } from "./lib/store";
import type { Role } from "./lib/types";
import { AttendanceCheck } from "./mobile/Attendance";
import { ForcedPassword, Login } from "./mobile/Auth";
import { History } from "./mobile/History";
import { homePath } from "./mobile/Shell";
import { HeadHome, MyInfo, Notifications, StudentDetail, StudentList, TeacherHome } from "./mobile/Teacher";
import { Toasts } from "./ui";

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
  return <Navigate to={u.mustChangePassword ? "/password" : homePath(u)} replace />;
}

export default function App() {
  const u = useMe();
  const T = (el: ReactNode) => <Guard roles={["teacher"]}>{el}</Guard>;
  const H = (el: ReactNode) => <Guard roles={["head"]}>{el}</Guard>;
  return (
    <BrowserRouter>
      {!remoteEnabled && <div className="demo-banner">데모 모드 · 예시 데이터이며 입력 내용은 이 브라우저에만 저장됩니다</div>}
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={u && !u.mustChangePassword ? <Navigate to={homePath(u)} replace /> : <Login />} />
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
    </BrowserRouter>
  );
}

import { AttendanceRecord } from "@/lib/api";

export function formatAttendanceTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function getAttendanceName(attendance: AttendanceRecord) {
  if (typeof attendance.user === "string" && attendance.user.trim()) {
    return attendance.user;
  }

  const user =
    typeof attendance.user === "object" ? attendance.user : undefined;

  return (
    user?.nama ||
    user?.name ||
    attendance.nama ||
    attendance.name ||
    "Unknown"
  );
}

export function getAttendanceNrp(attendance: AttendanceRecord) {
  return typeof attendance.user === "object"
    ? attendance.user.nrp || attendance.nrp || attendance.employee_id || "-"
    : attendance.nrp || attendance.employee_id || "-";
}

export function isAttendanceToday(attendance: AttendanceRecord) {
  if (!attendance.timestamp) return false;
  const timestamp = new Date(attendance.timestamp);
  const today = new Date();
  return timestamp.toDateString() === today.toDateString();
}

export function getAttendanceDateKey(attendance: AttendanceRecord) {
  if (!attendance.timestamp) return "";
  const date = new Date(attendance.timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function getAttendanceSearchText(attendance: AttendanceRecord) {
  return [
    getAttendanceName(attendance),
    getAttendanceNrp(attendance),
    attendance.class_name,
    attendance.schedule?.class_name,
    attendance.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function countAttendancesBySchedule(attendances: AttendanceRecord[]) {
  const counts = new Map<number, number>();

  for (const attendance of attendances) {
    if (attendance.schedule_id) {
      counts.set(
        attendance.schedule_id,
        (counts.get(attendance.schedule_id) || 0) + 1
      );
    }
  }

  return counts;
}

export function countAttendancesByStatus(attendances: AttendanceRecord[]) {
  return attendances.reduce(
    (counts, attendance) => {
      if (attendance.status === "late") {
        counts.late += 1;
      } else if (attendance.status === "present") {
        counts.present += 1;
      } else {
        counts.recorded += 1;
      }

      return counts;
    },
    { late: 0, present: 0, recorded: 0 }
  );
}

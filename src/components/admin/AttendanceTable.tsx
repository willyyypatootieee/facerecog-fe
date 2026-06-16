import { API_URL, AttendanceRecord, Schedule } from "@/lib/api";
import {
  formatAttendanceTime,
  getAttendanceName,
  getAttendanceNrp,
} from "@/lib/attendance";

type AttendanceTableProps = {
  attendances: AttendanceRecord[];
  schedules: Schedule[];
};

export function AttendanceTable({
  attendances,
  schedules,
}: AttendanceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr className="text-slate-500">
            <th>User</th>
            <th>Schedule</th>
            <th>Timestamp</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {attendances.map((attendance, index) => {
            const nrp = getAttendanceNrp(attendance);
            const photoUrl =
              nrp !== "-" ? `${API_URL}/users/${nrp}/face` : null;
            const schedule = schedules.find(
              (item) => item.id === attendance.schedule_id
            );

            return (
              <tr
                key={attendance.id || `${nrp}-${index}`}
                className="border-slate-100"
              >
                <td>
                  <div className="flex items-center gap-3">
                    <div className="avatar">
                      <div className="h-10 w-10 rounded bg-slate-100">
                        {photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoUrl}
                            alt=""
                            crossOrigin="anonymous"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <div className="font-bold">
                        {getAttendanceName(attendance)}
                      </div>
                      <div className="text-xs text-slate-500">NRP: {nrp}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {schedule?.class_name ||
                    attendance.schedule?.class_name ||
                    attendance.class_name ||
                    attendance.schedule_id ||
                    "-"}
                </td>
                <td>{formatAttendanceTime(attendance.timestamp)}</td>
                <td>
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold ${
                      attendance.status === "late"
                        ? "bg-amber-100 text-amber-800"
                        : attendance.status === "present"
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {attendance.status || "recorded"}
                  </span>
                  {typeof attendance.confidence === "number" && (
                    <div className="mt-1 text-xs text-slate-500">
                      {(attendance.confidence * 100).toFixed(1)}%
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {attendances.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-slate-500">
                No attendances found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

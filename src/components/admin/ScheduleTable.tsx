import { Schedule } from "@/lib/api";

type ScheduleTableProps = {
  activeSchedule?: Schedule;
  attendanceCountBySchedule: Map<number, number>;
  onForceOpen: (scheduleId: number, currentActive: boolean) => void;
  onSelectSchedule: (scheduleId: string) => void;
  schedules: Schedule[];
  selectedScheduleId: string;
};

export function ScheduleTable({
  activeSchedule,
  attendanceCountBySchedule,
  onForceOpen,
  onSelectSchedule,
  schedules,
  selectedScheduleId,
}: ScheduleTableProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-5">
        <h2 className="text-lg font-bold">Schedules</h2>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {activeSchedule ? "1 open" : "all closed"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr className="text-slate-500">
              <th>Class</th>
              <th>Time</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr
                key={schedule.id}
                className={`cursor-pointer border-slate-100 ${
                  selectedScheduleId === schedule.id.toString()
                    ? "bg-blue-50"
                    : ""
                }`}
                onClick={() => onSelectSchedule(schedule.id.toString())}
              >
                <td>
                  <div className="font-bold">{schedule.class_name}</div>
                  <div className="text-xs text-slate-500">
                    {schedule.lecturer} - Room {schedule.room}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-blue-700">
                    {attendanceCountBySchedule.get(schedule.id) || 0} logs
                  </div>
                </td>
                <td>
                  <div>{schedule.day_of_week}</div>
                  <div className="text-xs text-slate-500">
                    {schedule.start_time} - {schedule.end_time}
                  </div>
                </td>
                <td>
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      schedule.is_active
                        ? "bg-green-600 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {schedule.is_active ? "Open" : "Closed"}
                  </span>
                </td>
                <td>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onForceOpen(schedule.id, schedule.is_active);
                    }}
                    className={`btn btn-xs ${
                      schedule.is_active
                        ? "btn-error text-white"
                        : "btn-success text-white"
                    }`}
                  >
                    {schedule.is_active ? "Close" : "Open"}
                  </button>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  No schedules found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

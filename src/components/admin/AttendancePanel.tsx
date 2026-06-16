import { AttendanceRecord, Schedule } from "@/lib/api";
import { countAttendancesByStatus } from "@/lib/attendance";
import {
  AttendanceFilters,
  AttendanceStatusFilter,
} from "@/components/admin/AttendanceFilters";
import { AttendanceTable } from "@/components/admin/AttendanceTable";

type AttendancePanelProps = {
  dateFilter: string;
  filteredAttendances: AttendanceRecord[];
  onDateFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSelectedScheduleChange: (value: string) => void;
  onStatusFilterChange: (value: AttendanceStatusFilter) => void;
  schedules: Schedule[];
  search: string;
  selectedSchedule?: Schedule;
  selectedScheduleId: string;
  statusFilter: AttendanceStatusFilter;
};

export function AttendancePanel({
  dateFilter,
  filteredAttendances,
  onDateFilterChange,
  onSearchChange,
  onSelectedScheduleChange,
  onStatusFilterChange,
  schedules,
  search,
  selectedSchedule,
  selectedScheduleId,
  statusFilter,
}: AttendancePanelProps) {
  const statusCounts = countAttendancesByStatus(filteredAttendances);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Attendance Logs</h2>
            <p className="text-sm text-slate-500">
              {selectedSchedule
                ? `${selectedSchedule.class_name} - ${selectedSchedule.room}`
                : "Select a class schedule"}
            </p>
          </div>
          <div className="flex gap-2 text-xs font-semibold">
            <span className="rounded bg-green-100 px-2 py-1 text-green-800">
              {statusCounts.present} present
            </span>
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">
              {statusCounts.late} late
            </span>
          </div>
        </div>

        <AttendanceFilters
          dateFilter={dateFilter}
          onDateFilterChange={onDateFilterChange}
          onSearchChange={onSearchChange}
          onSelectedScheduleChange={onSelectedScheduleChange}
          onStatusFilterChange={onStatusFilterChange}
          schedules={schedules}
          search={search}
          selectedScheduleId={selectedScheduleId}
          statusFilter={statusFilter}
        />
      </div>

      <AttendanceTable attendances={filteredAttendances} schedules={schedules} />
    </section>
  );
}

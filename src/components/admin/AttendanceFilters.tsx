import { Schedule } from "@/lib/api";

export type AttendanceStatusFilter = "all" | "present" | "late" | "recorded";

type AttendanceFiltersProps = {
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSelectedScheduleChange: (value: string) => void;
  onStatusFilterChange: (value: AttendanceStatusFilter) => void;
  schedules: Schedule[];
  search: string;
  selectedScheduleId: string;
  statusFilter: AttendanceStatusFilter;
};

export function AttendanceFilters({
  dateFilter,
  onDateFilterChange,
  onSearchChange,
  onSelectedScheduleChange,
  onStatusFilterChange,
  schedules,
  search,
  selectedScheduleId,
  statusFilter,
}: AttendanceFiltersProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_0.8fr_0.7fr_0.7fr]">
      <input
        className="input input-bordered input-sm bg-white text-slate-900"
        placeholder="Search name or NRP"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <select
        className="select select-bordered select-sm bg-white text-slate-900"
        value={selectedScheduleId}
        onChange={(event) => onSelectedScheduleChange(event.target.value)}
      >
        {schedules.map((schedule) => (
          <option key={schedule.id} value={schedule.id}>
            {schedule.class_name}
          </option>
        ))}
      </select>
      <select
        className="select select-bordered select-sm bg-white text-slate-900"
        value={statusFilter}
        onChange={(event) =>
          onStatusFilterChange(event.target.value as AttendanceStatusFilter)
        }
      >
        <option value="all">All status</option>
        <option value="present">Present</option>
        <option value="late">Late</option>
        <option value="recorded">Recorded</option>
      </select>
      <input
        className="input input-bordered input-sm bg-white text-slate-900"
        type="date"
        value={dateFilter}
        onChange={(event) => onDateFilterChange(event.target.value)}
      />
    </div>
  );
}

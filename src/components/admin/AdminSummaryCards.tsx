import { Schedule } from "@/lib/api";
import { ApiState } from "@/hooks/useAdminData";

type AdminSummaryCardsProps = {
  activeSchedule?: Schedule;
  apiState: ApiState;
  scheduleCount: number;
  todayCount: number;
};

export function AdminSummaryCards({
  activeSchedule,
  apiState,
  scheduleCount,
  todayCount,
}: AdminSummaryCardsProps) {
  return (
    <section className="grid gap-3 md:grid-cols-4">
      <SummaryCard
        label="API"
        value={apiState}
        valueClassName={
          apiState === "online"
            ? "text-green-700"
            : apiState === "offline"
              ? "text-red-700"
              : "text-amber-700"
        }
      />
      <SummaryCard
        label="Open Class"
        value={activeSchedule?.class_name || "None"}
      />
      <SummaryCard label="Schedules" value={scheduleCount.toString()} />
      <SummaryCard label="Today" value={`${todayCount} attendances`} />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={`truncate font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminSummaryCards } from "@/components/admin/AdminSummaryCards";
import { AttendancePanel } from "@/components/admin/AttendancePanel";
import { AttendanceStatusFilter } from "@/components/admin/AttendanceFilters";
import { ScheduleTable } from "@/components/admin/ScheduleTable";
import { useAdminData } from "@/hooks/useAdminData";
import {
  getAttendanceDateKey,
  getAttendanceSearchText,
} from "@/lib/attendance";

export default function AdminDashboard() {
  const {
    activeSchedule,
    apiState,
    attendanceCountBySchedule,
    attendances,
    error,
    forceOpenSchedule,
    loadAdminData,
    loadScheduleAttendances,
    loading,
    refreshing,
    schedules,
    selectedSchedule,
    selectedScheduleId,
    setSelectedScheduleId,
    todayCount,
  } = useAdminData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AttendanceStatusFilter>("all");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    if (!selectedScheduleId) return;

    void Promise.resolve().then(() =>
      loadScheduleAttendances(selectedScheduleId, {
        date: dateFilter,
        status:
          statusFilter === "present" || statusFilter === "late"
            ? statusFilter
            : undefined,
      })
    );
  }, [dateFilter, loadScheduleAttendances, selectedScheduleId, statusFilter]);

  const filteredAttendances = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return attendances.filter((attendance) => {
      const matchesSchedule =
        selectedScheduleId &&
        attendance.schedule_id?.toString() === selectedScheduleId;
      const matchesSearch =
        !normalizedSearch ||
        getAttendanceSearchText(attendance).includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "recorded"
            ? !attendance.status || attendance.status === "recorded"
            : attendance.status === statusFilter;
      const matchesDate =
        !dateFilter || getAttendanceDateKey(attendance) === dateFilter;

      return matchesSchedule && matchesSearch && matchesStatus && matchesDate;
    });
  }, [attendances, dateFilter, search, selectedScheduleId, statusFilter]);

  return (
    <div className="space-y-6 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Operations</p>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadAdminData()}
            className="btn btn-sm btn-outline"
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <Link
            href="/"
            className="btn btn-sm bg-blue-700 text-white hover:bg-blue-800"
          >
            Scanner
          </Link>
        </div>
      </header>

      <AdminSummaryCards
        activeSchedule={activeSchedule}
        apiState={apiState}
        scheduleCount={schedules.length}
        todayCount={todayCount}
      />

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <span className="loading loading-spinner loading-lg text-blue-700" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <ScheduleTable
            activeSchedule={activeSchedule}
            attendanceCountBySchedule={attendanceCountBySchedule}
            onForceOpen={(scheduleId, currentActive) =>
              void forceOpenSchedule(scheduleId, currentActive)
            }
            onSelectSchedule={setSelectedScheduleId}
            schedules={schedules}
            selectedScheduleId={selectedScheduleId}
          />

          <AttendancePanel
            dateFilter={dateFilter}
            filteredAttendances={filteredAttendances}
            onDateFilterChange={setDateFilter}
            onSearchChange={setSearch}
            onSelectedScheduleChange={setSelectedScheduleId}
            onStatusFilterChange={setStatusFilter}
            schedules={schedules}
            search={search}
            selectedSchedule={selectedSchedule}
            selectedScheduleId={selectedScheduleId}
            statusFilter={statusFilter}
          />
        </div>
      )}
    </div>
  );
}

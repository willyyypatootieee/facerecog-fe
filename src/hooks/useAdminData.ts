"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, AttendanceRecord, Schedule, fetchJson } from "@/lib/api";
import { stopBackendCamera } from "@/lib/camera";
import {
  countAttendancesBySchedule,
  isAttendanceToday,
} from "@/lib/attendance";

export type ApiState = "checking" | "online" | "offline";

export function useAdminData() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [allAttendances, setAllAttendances] = useState<AttendanceRecord[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [apiState, setApiState] = useState<ApiState>("checking");

  const parseAttendances = (data: AttendanceRecord[] | string) => {
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    return Array.isArray(parsed) ? parsed : [];
  };

  const loadScheduleAttendances = useCallback(
    async (
      scheduleId: string,
      filters: { date?: string; status?: string } = {}
    ) => {
      if (!scheduleId) {
        setAttendances([]);
        return;
      }

      try {
        const params = new URLSearchParams();
        if (filters.date) params.set("date", filters.date);
        if (filters.status && filters.status !== "all") {
          params.set("status", filters.status);
        }

        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchJson<AttendanceRecord[] | string>(
          `/admin/schedules/${scheduleId}/attendances${suffix}`
        );
        setAttendances(parseAttendances(data));
        setError("");
      } catch (loadError) {
        console.error("Schedule attendance error:", loadError);
        setError("Failed to fetch attendance logs for the selected schedule.");
      }
    },
    []
  );

  const loadAdminData = useCallback(async (showRefresh = true) => {
    if (showRefresh) {
      setRefreshing(true);
    }

    try {
      const [health, scheduleData, attendanceData] = await Promise.all([
        fetch(`${API_URL}/health`),
        fetchJson<Schedule[]>("/admin/schedules"),
        fetchJson<AttendanceRecord[] | string>("/admin/attendances"),
      ]);

      const parsedAttendances = parseAttendances(attendanceData);
      const nextSchedules = Array.isArray(scheduleData) ? scheduleData : [];
      const nextAttendances = parsedAttendances;
      const selectedStillExists =
        selectedScheduleId &&
        nextSchedules.some(
          (schedule) => schedule.id.toString() === selectedScheduleId
        );
      const active = nextSchedules.find((schedule) => schedule.is_active);
      const firstWithAttendance = nextSchedules.find((schedule) =>
        nextAttendances.some(
          (attendance) => attendance.schedule_id === schedule.id
        )
      );
      const nextSelectedScheduleId =
        (selectedStillExists
          ? selectedScheduleId
          : (active || firstWithAttendance || nextSchedules[0])?.id.toString()) ||
        "";

      setApiState(health.ok ? "online" : "offline");
      setSchedules(nextSchedules);
      setAllAttendances(nextAttendances);
      setSelectedScheduleId(nextSelectedScheduleId);
      setAttendances(
        nextSelectedScheduleId
          ? nextAttendances.filter(
              (attendance) =>
                attendance.schedule_id?.toString() === nextSelectedScheduleId
            )
          : []
      );
      setError("");
    } catch (loadError) {
      console.error("Admin data error:", loadError);
      setApiState("offline");
      setError("Failed to fetch admin data. Is the backend running?");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedScheduleId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadAdminData(false));
    void stopBackendCamera();
  }, [loadAdminData]);

  const activeSchedule = schedules.find((schedule) => schedule.is_active);
  const selectedSchedule = schedules.find(
    (schedule) => schedule.id.toString() === selectedScheduleId
  );
  const attendanceCountBySchedule = useMemo(
    () => countAttendancesBySchedule(allAttendances),
    [allAttendances]
  );
  const todayCount = allAttendances.filter(isAttendanceToday).length;

  const forceOpenSchedule = useCallback(
    async (scheduleId: number, currentActive: boolean) => {
      try {
        if (currentActive) {
          await fetchJson("/admin/schedules/close", { method: "POST" });
        } else {
          await fetchJson(`/admin/schedules/${scheduleId}/open`, {
            method: "POST",
          });
        }
        await loadAdminData();
      } catch (forceError) {
        try {
          await fetchJson(
            `/admin/schedules/${scheduleId}/force-open?open=${!currentActive}`,
            { method: "POST" }
          );
          await loadAdminData();
        } catch {
          const message =
            forceError instanceof Error
              ? forceError.message
              : "Failed to toggle schedule.";
          setError(message);
        }
      }
    },
    [loadAdminData]
  );

  return {
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
  };
}
